import { expect, test, type Page } from '@playwright/test';
import { addRegion, editRegion, newBlankWorksheet, openFresh, regions, waitReady } from './helpers.ts';

type State = { shapes: Record<string, { type: string; x: number; y: number; groupId?: string; props: Record<string, unknown> }>; selection: string[]; camera: { z: number } };
const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __calccanvas: { store: { getState(): State } } }).__calccanvas.store.getState() as unknown as State);
const shapesOf = async (page: Page, type: string) => Object.values((await state(page)).shapes).filter((s) => s.type === type);

test.describe('own canvas engine', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
    await newBlankWorksheet(page);
    // These tests use fixed screen coordinates: give the canvas the full width.
    await page.getByLabel('Close side panel').click();
  });

  test('text region: type, format, and leave', async ({ page }) => {
    await page.getByTestId('tool-text').click();
    await page.mouse.click(400, 300);
    await page.keyboard.type('Design parameters', { delay: 10 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('text-region')).toHaveText('Design parameters');
    const [t] = await shapesOf(page, 'text');
    expect(t.props.html).toContain('Design parameters');
    await page.getByTestId('text-region').click();
    const handle = await page.getByTestId('handle-se').boundingBox();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + 120, handle!.y + 70, { steps: 6 });
    await page.mouse.up();
    const [resized] = await shapesOf(page, 'text');
    expect(Number(resized.props.w)).toBeGreaterThan(Number(t.props.w) + 90);
    expect(Number(resized.props.h)).toBeGreaterThan(Number(t.props.h) + 40);
  });

  test('Space converts a word from Math to Text atomically and protects structured math', async ({ page }) => {
    await page.getByTestId('tool-math').click();
    await page.mouse.click(400, 300);
    await page.keyboard.type('Maximum', { delay: 15 });
    const [before] = Object.values((await state(page)).shapes);
    await page.keyboard.press('Space');
    await page.keyboard.type('steel reinforcement', { delay: 15 });
    await expect(page.getByTestId('text-region')).toHaveText('Maximum steel reinforcement');
    const [converted] = Object.values((await state(page)).shapes);
    expect(converted.type).toBe('text');
    expect({ x: converted.x, y: converted.y }).toEqual({ x: before.x, y: before.y });
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => Object.values((await state(page)).shapes)[0]?.type).toBe('math');
    await page.keyboard.press('ControlOrMeta+y');
    await expect.poll(async () => Object.values((await state(page)).shapes)[0]?.type).toBe('text');

    await page.getByTestId('tool-math').click();
    await page.mouse.click(700, 420);
    await page.keyboard.type('x:=125', { delay: 15 });
    await page.keyboard.press('Space');
    expect((await shapesOf(page, 'math')).length).toBe(1);
    await expect(page.locator('math-field')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('save-state')).toHaveText('Saved');
    await page.reload();
    await waitReady(page);
    await expect(page.getByTestId('text-region')).toHaveText('Maximum steel reinforcement');
    expect((await shapesOf(page, 'text')).length).toBe(1);
    expect((await shapesOf(page, 'math')).length).toBe(1);
  });

  test('undo and redo creation', async ({ page }) => {
    await addRegion(page, 400, 300, ['x:=1']);
    expect(await regions(page)).toHaveLength(1);
    await page.mouse.click(900, 600); // focus canvas, clear selection
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await regions(page)).length).toBe(0);
    await page.keyboard.press('ControlOrMeta+y');
    await expect.poll(async () => (await regions(page)).length).toBe(1);
  });

  test('math regions use intrinsic bounds and never expose resize handles', async ({ page }) => {
    await addRegion(page, 400, 300, ['x:=125']);
    const math = page.getByTestId('math-region').first();
    await math.click();
    await expect(page.getByTestId('selection-outline')).toHaveCSS('border-style', 'dashed');
    await expect(page.locator('[data-testid^="handle-"]')).toHaveCount(0);
    const short = await math.boundingBox();
    const [region] = await regions(page);
    await editRegion(page, region.id, ['x:=125+250+375+500+625']);
    await expect.poll(async () => (await math.boundingBox())?.width ?? 0).toBeGreaterThan(short!.width + 60);
    await math.click();
    await expect(page.locator('[data-testid^="handle-"]')).toHaveCount(0);

    await page.getByTestId('tool-math').click();
    await page.mouse.click(400, 420);
    await page.getByTestId('palette-operators').click();
    await page.getByTestId('palette-a/b').click();
    await page.keyboard.press('Escape');
    const fraction = page.getByTestId('math-region').filter({ has: page.locator('.ML__mfrac') });
    await expect(fraction).toHaveCount(1);
    await fraction.click();
    await expect(page.locator('[data-testid^="handle-"]')).toHaveCount(0);
  });

  test('copy, paste and duplicate', async ({ page }) => {
    await addRegion(page, 400, 300, ['x:=1']);
    const r = (await regions(page))[0];
    const box = await page.locator(`.math-region[data-shape-id="${r.id}"]`).boundingBox();
    await page.mouse.click(box!.x + 10, box!.y + box!.height / 2); // select it
    await page.keyboard.press('ControlOrMeta+c');
    await page.keyboard.press('ControlOrMeta+v');
    await expect.poll(async () => (await regions(page)).length).toBe(2);
    await page.keyboard.press('ControlOrMeta+d');
    await expect.poll(async () => (await regions(page)).length).toBe(3);
    // Same variable defined three times → no errors; the last one is marked as a redefinition (green)
    await expect.poll(async () => (await regions(page)).every((r) => r.error === '')).toBe(true);
    // each later copy redefines x (green)
    await expect(page.locator('.math-region[data-redefines="x"]')).toHaveCount(2);
    const outline = await page.locator('.math-region[data-redefines="x"]').first().evaluate((el) => getComputedStyle(el).outlineColor);
    expect(outline).toBe('rgb(24, 128, 56)');
  });

  test('marquee selects several regions; delete removes them', async ({ page }) => {
    await addRegion(page, 300, 250, ['a:=1']);
    await addRegion(page, 300, 330, ['b:=2']);
    await page.mouse.click(1000, 650);
    await page.mouse.move(250, 200);
    await page.mouse.down();
    await page.mouse.move(520, 420, { steps: 8 });
    await page.mouse.up();
    expect((await state(page)).selection).toHaveLength(2);
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await regions(page)).length).toBe(0);
  });

  test('Insert tab: ready-made shapes go in as one group; the character map types into text', async ({ page }) => {
    await page.getByTestId('format-tab-insert').click();
    await page.getByTestId('insert-shapes').click();
    await page.getByTestId('shape-roller-support').click();
    const parts = [...(await shapesOf(page, 'draw')), ...(await shapesOf(page, 'line'))];
    expect(parts).toHaveLength(4);
    expect(new Set(parts.map((p) => p.groupId)).size).toBe(1);
    expect(parts[0].groupId).toBeTruthy();
    expect((await state(page)).selection).toHaveLength(4);
    // Steel section outlines are in the same gallery.
    await page.getByTestId('insert-shapes').click();
    await page.getByTestId('shape-steel-i').click();
    expect(await shapesOf(page, 'draw')).toHaveLength(4);
    // Nothing being edited: a new text region holding the character.
    await page.keyboard.press('Escape');
    await page.getByTestId('insert-charmap').click();
    await page.getByTestId('char-phi').click();
    await expect(page.getByTestId('text-region')).toHaveText('φ');
    // While editing, the character goes in at the caret.
    await page.keyboard.type(' = 30', { delay: 10 });
    await page.getByTestId('insert-charmap').click();
    await page.getByTestId('char-degree').click();
    await expect(page.getByTestId('text-region')).toHaveText('φ = 30°');
  });

  test('Matrices/Tables tab: insert a matrix and a table, add a table row', async ({ page }) => {
    await page.getByTestId('format-tab-matrices').click();
    await page.getByTestId('insert-matrix').click();
    await page.getByRole('gridcell', { name: '2 by 3' }).click();
    const matrix = page.locator('[data-testid=math-region][data-latex*="bmatrix"]');
    await expect(matrix).toHaveCount(1);
    await page.keyboard.press('Space');
    await expect(page.locator('math-field')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await matrix.click();
    await expect(page.locator('[data-testid^="handle-"]')).toHaveCount(0);
    await page.mouse.click(700, 600);
    await page.getByTestId('insert-table').click();
    await page.getByRole('gridcell', { name: '2 by 2' }).click();
    const cell = page.getByLabel('Table cell 1, 1');
    await cell.fill('fck');
    await page.getByTestId('grid-insert-below').click();
    const [t] = await shapesOf(page, 'table');
    expect(t.props.rows).toBe(3);
    expect((t.props.cells as { value: string }[][])[0][0].value).toBe('fck');
  });

  test('draw and resize a rectangle, draw a line', async ({ page }) => {
    await page.getByTestId('format-tab-insert').click();
    await page.getByTestId('tool-rect').click();
    await page.mouse.move(400, 300);
    await page.mouse.down();
    await page.mouse.move(520, 380, { steps: 6 });
    await page.mouse.up();
    const [r] = await shapesOf(page, 'rect');
    expect(r.props.w).toBeGreaterThan(100);
    const handle = await page.getByTestId('handle-se').boundingBox();
    await page.mouse.move(handle!.x + 4, handle!.y + 4);
    await page.mouse.down();
    await page.mouse.move(handle!.x + 64, handle!.y + 44, { steps: 6 });
    await page.mouse.up();
    const [r2] = await shapesOf(page, 'rect');
    expect(Number(r2.props.w)).toBeGreaterThan(Number(r.props.w) + 40);

    await page.getByTestId('tool-arrow').click();
    await page.mouse.move(400, 500);
    await page.mouse.down();
    await page.mouse.move(600, 500, { steps: 6 });
    await page.mouse.up();
    const [l] = await shapesOf(page, 'line');
    expect(l.props.arrow).toBe(true);
    expect(Number(l.props.x2)).toBeGreaterThan(150);
  });

  test('ctrl+wheel zooms, regions keep their results', async ({ page }) => {
    await addRegion(page, 400, 300, ['L:=8.5m=']);
    const z0 = (await state(page)).camera.z;
    await page.mouse.move(500, 400);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await expect.poll(async () => (await state(page)).camera.z).toBeGreaterThan(z0);
    expect((await regions(page))[0].result).toBe('8.5 m');
  });
});
