import { expect, test, type Page } from '@playwright/test';
import { addRegion, newBlankWorksheet, openFresh, regions } from './helpers.ts';

type State = { shapes: Record<string, { type: string; x: number; y: number; props: Record<string, unknown> }>; selection: string[]; camera: { z: number } };
const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __calccanvas: { store: { getState(): State } } }).__calccanvas.store.getState() as unknown as State);
const shapesOf = async (page: Page, type: string) => Object.values((await state(page)).shapes).filter((s) => s.type === type);

test.describe('own canvas engine', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
    await newBlankWorksheet(page);
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
    // Same variable defined three times → engine flags duplicates
    await expect.poll(async () => (await regions(page)).every((r) => r.error.startsWith('Duplicate'))).toBe(true);
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

  test('draw and resize a rectangle, draw a line', async ({ page }) => {
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
