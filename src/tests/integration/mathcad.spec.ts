import { expect, test } from '@playwright/test';
import { addRegion, newBlankWorksheet, openFresh, region, regions, resultOf } from './helpers.ts';

test.describe('Mathcad keys, constants, page chrome and text styling', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
    await newBlankWorksheet(page);
  });

  test('":" defines, "\\" is square root, "." starts a subscript, Ctrl+G makes Greek', async ({ page }) => {
    await addRegion(page, 300, 220, ['M.Ed:4']);
    await expect.poll(async () => (await regions(page))[0]?.latex).toMatch(/^M_\{Ed\}\\coloneq\s*4$/);
    await addRegion(page, 300, 300, ['r:', '\\', '16', '{ArrowRight}', '=']);
    await resultOf(page, 'r').toBe('4');
    await addRegion(page, 300, 380, ['a', '{Control+g}', ':2=']);
    await resultOf(page, '\\alpha').toBe('2');
  });

  test('operators leave literal subscripts reached by typing, arrows or a mouse click', async ({ page }, testInfo) => {
    await addRegion(page, 500, 280, ['M.Ed:100']);
    await addRegion(page, 500, 360, ['N.Ed:20']);
    await addRegion(page, 500, 440, ['r:2']);
    await addRegion(page, 500, 580, ['M.Ed/N.Ed=']);
    const formula = page.getByTestId('math-region').last();
    await formula.dblclick();
    const editor = page.getByTestId('math-input');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await test.step('operators leave both dot and underscore subscripts', async () => {
      for (const [operator, expected] of [
        ['+', 'M_{Ed}+2'], ['-', 'M_{Ed}-2'], ['*', 'M_{Ed}\\cdot2'],
        ['/', '\\frac{M_{Ed}}{2}'], ['^', 'M_{Ed}^2'], [':', 'M_{Ed}\\coloneq2'],
        ['=', 'M_{Ed}=2'], ['<', 'M_{Ed}<2'], ['>', 'M_{Ed}>2'],
      ]) {
        await editor.press('Control+a');
        await page.keyboard.type(`M.Ed${operator}2`);
        await expect(editor).toHaveJSProperty('value', expected);
      }
      await editor.press('Control+a');
      await page.keyboard.type('M_Ed*2');
      await expect(editor).toHaveJSProperty('value', 'M_{Ed}\\cdot2');
      await editor.press('Control+a');
      await page.keyboard.type('M.Ed');
      await editor.press('ArrowRight');
      await editor.press('ArrowLeft');
      await page.keyboard.type('*2');
      await expect(editor).toHaveJSProperty('value', 'M_{Ed}\\cdot2');
      await editor.press('Control+a');
      await page.keyboard.type('M.Ed');
      await editor.press('Control+9');
      await page.keyboard.type('2');
      await expect(editor).toHaveJSProperty('value', 'M_{Ed}\\le2');
    });
    const seed = async (latex: string, atom?: string, last = false) => editor.evaluate((el, args) => {
      const mf = el as HTMLElement & { value: string; position: number; lastOffset: number; getElementInfo(n: number): { latex?: string }; executeCommand(s: string): void };
      mf.value = args.latex;
      const offsets = Array.from({ length: mf.lastOffset + 1 }, (_, i) => i).filter(i => mf.getElementInfo(i)?.latex === args.atom);
      mf.position = args.atom ? offsets[args.last ? offsets.length - 1 : 0] : mf.lastOffset;
    }, { latex, atom, last });
    await test.step('superscripts, ordinary fraction arithmetic and summation limits keep their scope', async () => {
      await seed('\\phi_{w}', 'w');
      await page.keyboard.type('*r');
      await expect(editor).toHaveJSProperty('value', '\\phi_{w}\\cdot r');
      await seed('\\mathrm{M}_{Ed}', 'd');
      await page.keyboard.type('*r');
      await expect(editor).toHaveJSProperty('value', '\\mathrm{M}_{Ed}\\cdot r');
      await seed('M_{Ed}^2', '2');
      await page.keyboard.type('-1');
      await expect(editor).toHaveJSProperty('value', 'M_{Ed}^{2-1}');
      await seed('\\frac{a}{b}', 'a');
      await page.keyboard.type('+1');
      await expect(editor).toHaveJSProperty('value', '\\frac{a+1}{b}');
      await seed('\\frac{a}{b}', 'b');
      await page.keyboard.type('+1');
      await expect(editor).toHaveJSProperty('value', '\\frac{a}{b+1}');
      await seed('\\frac{a}{b}_{i}', 'a');
      await page.keyboard.type('+1');
      await expect(editor).toHaveJSProperty('value', '\\frac{a+1}{b}_{i}');
      await seed('\\sum_{i=1}^{n}a_i', 'i');
      await page.keyboard.type('+1');
      await expect.poll(() => editor.evaluate(el => (el as HTMLElement & { value: string }).value)).toContain('_{i+1=1}');
    });
    await test.step('ribbon operators leave a literal subscript too', async () => {
      await seed('M_{Ed}', 'd');
      await page.getByTestId('palette-operators').click();
      await page.getByTestId('palette-·').click();
      await page.keyboard.type('r');
      await expect(editor).toHaveJSProperty('value', 'M_{Ed}\\cdot r');
      await page.getByTestId('palette-operators').click();
    });
    await test.step('clicking a subscript in either fraction branch exits only that subscript', async () => {
      for (const last of [false, true]) {
        await seed('\\frac{M_{Ed}}{N_{Ed}}');
        const point = await editor.evaluate(async (el, useLast) => {
          const mf = el as HTMLElement & { lastOffset: number; getElementInfo(n: number): { latex?: string; bounds?: DOMRect } };
          await new Promise(requestAnimationFrame);
          const atoms = Array.from({ length: mf.lastOffset + 1 }, (_, i) => mf.getElementInfo(i)).filter(info => info?.latex === 'd');
          const bounds = atoms[useLast ? atoms.length - 1 : 0].bounds!;
          return { x: bounds.x + bounds.width * 0.8, y: bounds.y + bounds.height / 2 };
        }, last);
        await page.mouse.click(point.x, point.y);
        await page.keyboard.type('*r');
        await expect(editor).toHaveJSProperty('value', last ? '\\frac{M_{Ed}}{N_{Ed}\\cdot r}' : '\\frac{M_{Ed}\\cdot r}{N_{Ed}}');
      }
      await seed('\\frac{M_{Ed}}{N_{Ed}}', 'd');
      await page.keyboard.type('*r=');
      await editor.press('Enter');
      await resultOf(page, '\\frac{M_{Ed}\\cdot r}').toBe('10');
    });
    await page.screenshot({ path: testInfo.outputPath('subscript-operator.png') });
    await page.getByTestId('export-pdf').click();
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: testInfo.outputPath('subscript-operator.pdf'), preferCSSPageSize: true, printBackground: true });
  });

  test('formula result units are selectable fractions and convert without changing inputs', async ({ page }, testInfo) => {
    await addRegion(page, 500, 260, ['w:15kN/m']);
    const input = (await region(page, 'w'))!;
    await page.locator(`[data-testid=math-region][data-shape-id="${input.id}"]`).dblclick();
    await expect(page.getByTestId('inline-result-unit')).toHaveCount(0);
    await page.getByTestId('math-input').press('Escape');
    await expect(page.locator('math-field')).toHaveCount(0);
    await addRegion(page, 500, 400, ['p:w=']);
    const formula = (await region(page, 'p'))!;
    const block = page.locator(`[data-testid=math-region][data-shape-id="${formula.id}"]`);
    const geometry = () => page.evaluate(id => {
      const s = (window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { x: number; y: number; props: { w: number; h: number } }> } } } }).__calccanvas.store.getState().shapes[id];
      return { x: s.x, y: s.y, w: s.props.w, h: s.props.h };
    }, formula.id);
    const before = await geometry();
    await test.step('automatic result units expose a stacked fraction and an outlined editor', async () => {
      await block.locator('[data-result-unit]').click();
      const editor = page.getByTestId('inline-result-unit');
      await expect(editor).toHaveJSProperty('value', '\\frac{\\unit{kN}}{\\unit{m}}');
      await expect(editor).toHaveCSS('outline-style', 'solid');
      await expect(editor).toHaveCSS('outline-width', '1px');
      await editor.press('Escape');
    });
    await block.dblclick();
    const unit = page.getByTestId('inline-result-unit');
    await expect(unit).toHaveJSProperty('value', '\\frac{\\unit{kN}}{\\unit{m}}');
    await expect(page.getByTestId('math-edit-block').locator('math-field')).toHaveCount(2);
    await expect(page.getByTestId('math-input')).toHaveCSS('border-top-width', '0px');
    await expect(page.getByTestId('math-input')).toHaveJSProperty('value', 'p\\coloneq w');
    await expect(unit).toHaveCSS('border-top-width', '0px');
    await unit.click();
    await expect.poll(() => unit.evaluate(el => (el as HTMLElement & { selectionIsCollapsed: boolean }).selectionIsCollapsed)).toBe(true);
    await unit.press('Control+a');
    await page.screenshot({ path: testInfo.outputPath('result-unit-edit.png') });
    await page.keyboard.type('N/m');
    await page.keyboard.press('Enter');
    await resultOf(page, 'p').toBe('15000 N/m');
    await expect.poll(geometry).toEqual(before);
    await expect.poll(async () => (await region(page, 'w'))?.latex).toBe(input.latex);
    await expect.poll(async () => (await region(page, 'p'))?.latex).toBe(formula.latex);
    await unit.press('Control+a');
    await unit.pressSequentially('s');
    await unit.press('Enter');
    await expect(page.getByRole('alert')).toBeVisible();
    await resultOf(page, 'p').toBe('15000 N/m');
    await unit.press('Escape');
    await page.getByTestId('math-input').press('Escape');
    await expect(page.locator('math-field')).toHaveCount(0);
    const fractionBounds = await block.boundingBox();
    await block.locator('[data-result-unit]').click();
    await expect(page.getByTestId('math-input')).toHaveCount(0);
    expect(await block.boundingBox()).toEqual(fractionBounds);
    await expect(unit).toHaveJSProperty('value', '\\frac{\\unit{N}}{\\unit{m}}');
    await unit.press('Control+a');
    await page.keyboard.type('kN/m');
    await page.mouse.click(900, 600);
    await expect(page.locator('math-field')).toHaveCount(0);
    await resultOf(page, 'p').toBe('15 kN/m');
    await expect.poll(async () => (await region(page, 'w'))?.latex).toBe(input.latex);
    await test.step('click a length unit, select it and replace it without Enter', async () => {
      await addRegion(page, 700, 260, ['L:469mm']);
      const length = (await region(page, 'L'))!;
      await addRegion(page, 700, 400, ['z:L=']);
      const z = (await region(page, 'z'))!;
      const zblock = page.locator(`[data-testid=math-region][data-shape-id="${z.id}"]`);
      const bounds = await zblock.boundingBox();
      const rendered = await zblock.locator('.math-baseline').innerHTML();
      await zblock.locator('[data-result-unit]').click();
      await expect(page.getByTestId('math-input')).toHaveCount(0);
      expect(await zblock.boundingBox()).toEqual(bounds);
      expect(await zblock.locator('.math-baseline').innerHTML()).toBe(rendered);
      await page.screenshot({ path: testInfo.outputPath('result-unit-direct.png') });
      await expect(unit).toHaveJSProperty('value', '\\unit{m}');
      await unit.click();
      await unit.press('Control+a');
      await page.keyboard.type('mm');
      await page.mouse.click(900, 600);
      await resultOf(page, 'z').toBe('469 mm');
      await zblock.locator('[data-result-unit]').click();
      await expect(unit).toHaveJSProperty('value', '\\unit{mm}');
      await unit.click();
      await unit.press('Control+a');
      await page.keyboard.type('cm');
      await page.mouse.click(900, 600);
      await resultOf(page, 'z').toBe('46.9 cm');
      await expect.poll(async () => (await region(page, 'L'))?.latex).toBe(length.latex);
    });
    await page.screenshot({ path: testInfo.outputPath('result-unit.png') });
    await page.getByTestId('export-pdf').click();
    await expect(page.locator('#print-root .print-page')).toHaveCount(1);
    await expect(page.locator('#print-root [data-testid=math-region]')).toHaveCount(4);
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: testInfo.outputPath('result-unit.pdf'), preferCSSPageSize: true, printBackground: true });
  });

  test('result units support normal math editing, scaled units and cancellation', async ({ page }, testInfo) => {
    await addRegion(page, 500, 280, ['F:100kN']);
    await addRegion(page, 500, 420, ['M:F*2m=']);
    const source = (await region(page, 'M'))!;
    const block = page.locator(`[data-testid=math-region][data-shape-id="${source.id}"]`);
    const unit = page.getByTestId('inline-result-unit');
    await test.step('unit and selection boxes grow with a draft and shrink on cancellation', async () => {
      await block.locator('[data-result-unit]').click();
      const initial = (await unit.boundingBox())!;
      await unit.press('Control+a');
      await page.keyboard.type('kN*m*m*m*m*m*m/m^2');
      await expect.poll(async () => (await unit.boundingBox())!.width).toBeGreaterThan(initial.width);
      await expect.poll(async () => (await unit.boundingBox())!.height).toBeGreaterThan(initial.height);
      await expect.poll(async () => {
        const field = (await unit.boundingBox())!;
        const outline = (await page.getByTestId('selection-outline').boundingBox())!;
        return outline.x <= field.x && outline.y <= field.y && outline.x + outline.width >= field.x + field.width && outline.y + outline.height >= field.y + field.height;
      }).toBe(true);
      await resultOf(page, 'M').toBe('200 kN·m');
      await expect(block).toHaveAttribute('data-latex', source.latex);
      await page.screenshot({ path: testInfo.outputPath('unit-draft-expanded.png') });
      await unit.press('Escape');
      await expect(unit).toHaveCount(0);
      await block.locator('[data-result-unit]').click();
      await expect.poll(async () => (await unit.boundingBox())!.width).toBe(initial.width);
      await unit.press('Escape');
    });
    await test.step('click places a caret and a product can be extended into a fraction', async () => {
      await block.locator('[data-result-unit]').click({ position: { x: 1, y: 8 } });
      await expect.poll(() => unit.evaluate(el => (el as HTMLElement & { selectionIsCollapsed: boolean }).selectionIsCollapsed)).toBe(true);
      await unit.press('End');
      await page.keyboard.type('*m/m');
      await expect(unit).toHaveJSProperty('value', '\\unit{kN}\\cdot\\unit{m}\\cdot\\frac{m}{m}');
      await unit.press('Enter');
      await resultOf(page, 'M').toBe('200 kN·m·m/m');
    });
    await test.step('a numeric multiplier compensates the result and survives reopening', async () => {
      await block.locator('[data-result-unit]').click();
      await unit.press('Home');
      await page.keyboard.type('10*');
      await page.screenshot({ path: testInfo.outputPath('editable-unit-draft.png') });
      await unit.press('Enter');
      await resultOf(page, 'M').toBe('20 (10·kN·m·m/m)');
      await expect(block).toHaveAttribute('data-latex', source.latex);
      await page.mouse.click(900, 600);
      await page.keyboard.press('Control+z');
      await resultOf(page, 'M').toBe('200 kN·m·m/m');
      await page.keyboard.press('Control+y');
      await resultOf(page, 'M').toBe('20 (10·kN·m·m/m)');
      await page.screenshot({ path: testInfo.outputPath('scaled-unit.png') });
      await page.reload();
      await resultOf(page, 'M').toBe('20 (10·kN·m·m/m)');
      await block.locator('[data-result-unit]').click();
      await expect(unit).toHaveJSProperty('value', '\\left(\\frac{10\\cdot\\unit{kN}\\cdot\\unit{m}\\cdot\\unit{m}}{\\unit{m}}\\right)');
      await unit.press('Escape');
    });
    await test.step('powers, selection, undo and redo work without committing a draft', async () => {
      await block.locator('[data-result-unit]').click();
      await unit.press('Control+a');
      await page.keyboard.type('kN*m^2');
      await expect(unit).toHaveJSProperty('value', '\\unit{kN}\\cdot m^2');
      await resultOf(page, 'M').toBe('20 (10·kN·m·m/m)');
      await unit.press('Control+z');
      await expect(unit).not.toHaveJSProperty('value', '\\unit{kN}\\cdot m^2');
      await unit.press('Control+y');
      await expect(unit).toHaveJSProperty('value', '\\unit{kN}\\cdot m^2');
      await unit.press('ArrowRight');
      await page.keyboard.type('/m');
      await unit.press('Enter');
      await resultOf(page, 'M').toBe('200 kN·m²/m');
    });
    await test.step('incompatible or incomplete units stay editable and Escape restores the result', async () => {
      await block.locator('[data-result-unit]').click();
      await unit.press('Control+a');
      await page.keyboard.type('s');
      await unit.press('Enter');
      await expect(page.getByRole('alert')).toBeVisible();
      await resultOf(page, 'M').toBe('200 kN·m²/m');
      await unit.press('Escape');
      await block.locator('[data-result-unit]').click();
      await unit.press('Control+a');
      await page.keyboard.type('kN/');
      await unit.press('Enter');
      await unit.dispatchEvent('input');
      await expect(page.getByRole('alert')).toBeVisible();
      await unit.press('Escape');
    });
    await test.step('copy and paste stay inside the unit editor', async () => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await block.locator('[data-result-unit]').click();
      await unit.press('Control+a');
      const saved = await unit.evaluate(el => (el as HTMLElement & { value: string }).value);
      await unit.press('Control+c');
      await page.keyboard.type('s');
      await unit.press('Control+a');
      await unit.press('Control+v');
      await expect(unit).toHaveJSProperty('value', saved);
      await unit.press('Escape');
      await expect(page.getByTestId('math-region')).toHaveCount(2);
    });
    await test.step('ribbon operators insert into the focused unit, not its formula', async () => {
      await block.dblclick();
      await unit.click();
      await unit.press('Control+a');
      await page.keyboard.type('kN');
      await page.getByTestId('palette-operators').click();
      await page.getByTestId('palette-a/b').click();
      await expect.poll(() => unit.evaluate(el => (el as HTMLElement & { value: string }).value)).toContain('\\frac');
      await page.keyboard.type('m*m*m*m*m*m');
      await expect.poll(async () => {
        const field = (await unit.boundingBox())!;
        const outline = (await page.getByTestId('selection-outline').boundingBox())!;
        return outline.x <= field.x && outline.y <= field.y && outline.x + outline.width >= field.x + field.width && outline.y + outline.height >= field.y + field.height;
      }).toBe(true);
      await expect(page.getByTestId('math-input')).toHaveJSProperty('value', source.latex.replace(/=\s*$/, ''));
      await unit.press('Escape');
      await page.getByTestId('math-input').press('Escape');
    });
    await page.mouse.click(900, 600);
    await page.screenshot({ path: testInfo.outputPath('editable-unit.png') });
    await page.getByTestId('export-pdf').click();
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: testInfo.outputPath('editable-unit.pdf'), preferCSSPageSize: true, printBackground: true });
  });

  test('compound formulas edit at the clicked term without growing over the next check', async ({ page }, testInfo) => {
    await openFresh(page, 'rc-beam');
    await page.evaluate(async () => {
      const api = (window as unknown as { __calccanvas: { idle(): Promise<void>; store: { getState(): { shapes: Record<string, { x: number; y: number; props: { latex?: string } }> }; setState(patch: { camera: { x: number; y: number; z: number } }): void } } }).__calccanvas;
      await api.idle();
      const shape = Object.values(api.store.getState().shapes).find(s => s.props.latex?.startsWith('A_{s.min}\\coloneq'))!;
      api.store.setState({ camera: { x: shape.x - 200, y: shape.y - 260, z: 1 } });
    });
    const formula = (await region(page, 'A_{s.min}\\coloneq'))!;
    const block = page.locator(`[data-testid=math-region][data-shape-id="${formula.id}"]`);
    await expect(block).toBeInViewport();
    await expect(block.locator('.math-baseline .ML__latex')).toHaveCount(1);
    const before = (await block.boundingBox())!;
    await block.dblclick({ position: { x: before.width * 0.3, y: before.height / 2 } });
    const editor = page.getByTestId('math-input');
    await expect(editor).toHaveJSProperty('readOnly', false);
    expect(await block.boundingBox()).toEqual(before);
    await expect.poll(() => editor.evaluate(el => {
      const mf = el as HTMLElement & { position: number; lastOffset: number };
      return mf.position < mf.lastOffset;
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('compound-formula-edit.png') });
    await editor.press('Control+a');
    await page.keyboard.type('a:2mm^2');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('math-input')).toHaveCount(0);
    await expect(block).toHaveAttribute('data-latex', 'a\\coloneq2\\unit{mm}^2');
    await expect(block).toHaveAttribute('data-status', 'valid');
    await expect(block).toHaveAttribute('data-result', '2 mm²');
  });

  test('Enter moves the + cursor below so the next region stacks', async ({ page }) => {
    await addRegion(page, 300, 220, ['x:1']);
    await expect(page.getByTestId('crosshair')).toBeVisible();
    await page.keyboard.type('y:2', { delay: 15 });
    await page.keyboard.press('Enter');
    const all = await regions(page);
    expect(all).toHaveLength(2);
    const pos = await page.evaluate(() => {
      const st = (window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { x: number; y: number; props: { latex: string } }> } } } }).__calccanvas.store.getState();
      return Object.values(st.shapes).map((s) => ({ latex: s.props.latex, x: s.x, y: s.y }));
    });
    const x = pos.find((p) => p.latex.startsWith('x'))!;
    const y = pos.find((p) => p.latex.startsWith('y'))!;
    expect(y.y).toBeGreaterThan(x.y);
    expect(Math.abs(y.x - x.x)).toBeLessThan(12);
  });

  test('if(condition, true, false) typed on the keyboard picks the branch', async ({ page }) => {
    await addRegion(page, 300, 220, ['N:2000kN']);
    await addRegion(page, 300, 300, ['c:if(N>0kN,1,2.5', '{ArrowRight}', '=']);
    await resultOf(page, 'c').toBe('1');
  });

  test('constants: g, π and % from the keyboard and the Constants palette', async ({ page }) => {
    await addRegion(page, 300, 220, ['W:10kg*g=']);
    await resultOf(page, 'W').toBe('0.0981 kN');
    // Constants palette inserts into the open equation
    await page.getByTestId('tool-math').click();
    await page.mouse.click(300, 320);
    await page.keyboard.type('c:2*', { delay: 15 });
    await page.getByTestId('palette-constants').click();
    await page.getByTestId('palette-π').click();
    await page.keyboard.type('=', { delay: 15 });
    await page.keyboard.press('Enter');
    await resultOf(page, 'c').toBe('6.28');
  });

  test('header/footer and grid show on the page and can be toggled', async ({ page }) => {
    await page.getByTestId('format-tab-document').click();
    await page.getByTestId('doc-pages').check();
    await expect(page.getByTestId('page-header').first()).toBeVisible();
    await expect(page.getByTestId('page-footer').first()).toContainText('Page 1 of 1');
    await expect(page.getByTestId('page-grid').first()).toBeVisible();
    await page.getByTestId('toggle-chrome').click();
    await expect(page.getByTestId('page-header')).toHaveCount(0);
    await page.getByTestId('toggle-grid').click();
    await expect(page.getByTestId('page-grid')).toHaveCount(0);
  });

  test('text font and colour', async ({ page }) => {
    await page.getByTestId('tool-text').click();
    await page.mouse.click(400, 300);
    await page.keyboard.type('Load case 1', { delay: 10 });
    await page.keyboard.press('Escape');
    await page.getByTestId('text-region').click();
    await page.getByTestId('format-tab-text-format').click();
    await page.getByTestId('text-font').selectOption('Times New Roman');
    await page.getByTestId('toggle-properties').click();
    await page.getByLabel('Text color hex code').fill('#c2410c');
    await page.getByLabel('Text color hex code').press('Enter');
    const style = await page.getByTestId('text-region').evaluate((el) => ({ font: getComputedStyle(el).fontFamily, color: getComputedStyle(el).color }));
    expect(style.font).toContain('Times New Roman');
    expect(style.color).toBe('rgb(194, 65, 12)');
  });
});

void region;
