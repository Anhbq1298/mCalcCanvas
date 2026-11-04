import { expect, test, type Page } from '@playwright/test';
import { newBlankWorksheet, openFresh } from './helpers.ts';

type S = { id: string; type: string; x: number; y: number; props: { baseline?: number; fontSize: number } };
const shapes = (page: Page): Promise<S[]> =>
  page.evaluate(() =>
    Object.values((window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, S> } } } }).__calccanvas.store.getState().shapes),
  );
/** Ruled paper: x on the 10 px grid, first baseline on a 40 px major line (4 × 4 squares). */
const baseline = (s: S) => (s.type === 'math' ? (s.props.baseline ?? 4 + s.props.fontSize) : Math.round(s.props.fontSize * 1.09));
const onGrid = (s: S) => Math.abs((s.x - 76) % 10) === 0 && (s.y + baseline(s) - 60) % 40 === 0;

async function pageToScreen(page: Page, x: number, y: number) {
  return page.evaluate(([px, py]) => {
    const cam = (window as unknown as { __calccanvas: { store: { getState(): { camera: { x: number; y: number; z: number } } } } }).__calccanvas.store.getState().camera;
    const r = document.querySelector('[data-testid=canvas]')!.getBoundingClientRect();
    return { x: r.left + (px - cam.x) * cam.z, y: r.top + (py - cam.y) * cam.z };
  }, [x, y]);
}

test.describe('math and text regions snap strictly to the grid', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
    await newBlankWorksheet(page, 'page');
  });

  test('created, dragged and nudged regions stay on grid points', async ({ page }) => {
    const p = await pageToScreen(page, 76 + 33, 60 + 47); // deliberately between grid lines
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('a:1', { delay: 15 });
    await page.keyboard.press('Enter');
    const q = await pageToScreen(page, 76 + 207, 60 + 123);
    await page.mouse.click(q.x, q.y);
    await page.keyboard.press('"');
    await page.keyboard.type('Notes', { delay: 15 });
    await page.keyboard.press('Escape');
    for (const s of await shapes(page)) expect(onGrid(s), JSON.stringify(s)).toBe(true);

    // drag by an odd amount
    const box = await page.locator('.math-region').first().boundingBox();
    await page.mouse.move(box!.x + 6, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 6 + 37, box!.y + box!.height / 2 + 23, { steps: 7 });
    await page.mouse.up();
    const math = (await shapes(page)).find((s) => s.type === 'math')!;
    expect(onGrid(math)).toBe(true);

    // arrow keys: one grid square sideways, one major line down
    await page.keyboard.press('ArrowRight');
    const after = (await shapes(page)).find((s) => s.type === 'math')!;
    expect(after.x - math.x).toBe(10);
    expect(onGrid(after)).toBe(true);
    await page.keyboard.press('ArrowDown');
    const down = (await shapes(page)).find((s) => s.type === 'math')!;
    expect(down.y - after.y).toBe(40);
    expect(onGrid(down)).toBe(true);
  });

  test('the + insertion cursor sits on the grid', async ({ page }) => {
    const p = await pageToScreen(page, 76 + 54, 60 + 71);
    await page.mouse.click(p.x, p.y);
    const cross = await page.evaluate(() => (window as unknown as { __calccanvas: { store: { getState(): { crosshair: { x: number; y: number } } } } }).__calccanvas.store.getState().crosshair);
    expect((cross.x - 76) % 10).toBe(0);
    expect((cross.y - 60) % 40).toBe(0); // on a major line
  });

  test('Enter and arrow keys move the + cross line by line', async ({ page }) => {
    const p = await pageToScreen(page, 76 + 54, 60 + 71);
    await page.mouse.click(p.x, p.y);
    type C = { x: number; y: number };
    const cross = () => page.evaluate(() => (window as unknown as { __calccanvas: { store: { getState(): { crosshair: { x: number; y: number } } } } }).__calccanvas.store.getState().crosshair);
    const c0: C = await cross();
    await page.keyboard.press('Enter');
    const c1: C = await cross();
    expect(c1).toEqual({ x: c0.x, y: c0.y + 40 });
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowRight');
    expect(await cross()).toEqual({ x: c0.x + 10, y: c0.y + 40 });
    // Typing starts an equation whose baseline sits on the cross's line.
    await page.keyboard.type('k:2', { delay: 15 });
    await page.keyboard.press('Enter');
    const [m] = await shapes(page);
    expect(m.y + baseline(m)).toBe(c0.y + 40);
  });
});

test.describe('moving regions', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
    await newBlankWorksheet(page, 'page');
  });

  test('drag follows the pointer, shows where it lands, then drops on the grid', async ({ page }) => {
    const p = await pageToScreen(page, 76 + 40, 60 + 40);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('b:2', { delay: 15 });
    await page.keyboard.press('Enter');
    const box = await page.locator('.math-region').first().boundingBox();
    await page.mouse.move(box!.x + 8, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + 8 + 63, box!.y + box!.height / 2 + 27, { steps: 6 });
    await expect(page.getByTestId('drop-preview')).toBeVisible();
    await page.mouse.up();
    await expect(page.getByTestId('drop-preview')).toHaveCount(0);
    const [s] = await shapes(page);
    expect(onGrid(s)).toBe(true);
    expect(s.x).toBeGreaterThan(76 + 40 + 40);
  });

  test('the ⠿ grip moves a region even while typing in it', async ({ page }) => {
    const p = await pageToScreen(page, 76 + 100, 60 + 100);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('c:3', { delay: 15 });
    await expect(page.locator('math-field')).toHaveCount(1);
    const before = (await shapes(page))[0];
    const grip = await page.getByTestId('grip').first().boundingBox();
    await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip!.x + 120, grip!.y + 80, { steps: 6 });
    await page.mouse.up();
    const after = (await shapes(page))[0];
    expect(after.x - before.x).toBeGreaterThanOrEqual(100);
    expect(onGrid(after)).toBe(true);
    await expect(page.locator('math-field')).toHaveCount(1); // still editing
  });
});
