import { expect, test, type Page } from '@playwright/test';
import { addRegion, newBlankWorksheet, openFresh, regions } from './helpers.ts';

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
    await expect(page.locator('[data-testid=math-region][data-latex*="bmatrix"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
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
