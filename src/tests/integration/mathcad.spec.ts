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
    await block.dblclick();
    const unit = page.getByTestId('inline-result-unit');
    await expect(unit).toHaveJSProperty('value', '\\frac{\\mathrm{kN}}{\\mathrm{m}}');
    await unit.click();
    await expect.poll(() => unit.evaluate(el => (el as HTMLElement & { selectionIsCollapsed: boolean }).selectionIsCollapsed)).toBe(false);
    await unit.press('Control+a');
    await unit.pressSequentially('N/m');
    await unit.press('Enter');
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
    await page.screenshot({ path: testInfo.outputPath('result-unit.png') });
    await page.getByTestId('export-pdf').click();
    await expect(page.locator('#print-root .print-page')).toHaveCount(1);
    await expect(page.locator('#print-root [data-testid=math-region]')).toHaveCount(2);
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: testInfo.outputPath('result-unit.pdf'), preferCSSPageSize: true, printBackground: true });
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
