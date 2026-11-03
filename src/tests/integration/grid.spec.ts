import { expect, test, type Page } from '@playwright/test';
import { newBlankWorksheet, openFresh } from './helpers.ts';

type S = { id: string; type: string; x: number; y: number };
const shapes = (page: Page): Promise<S[]> =>
  page.evaluate(() =>
    Object.values((window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, S> } } } }).__calccanvas.store.getState().shapes),
  );
const onGrid = (s: S) => Math.abs((s.x - 76) % 10) === 0 && (s.y - 60) % 10 === 0;

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

    // arrow key moves one grid square
    await page.keyboard.press('ArrowRight');
    const after = (await shapes(page)).find((s) => s.type === 'math')!;
    expect(after.x - math.x).toBe(10);
    expect(onGrid(after)).toBe(true);
  });

  test('the + insertion cursor sits on the grid', async ({ page }) => {
    const p = await pageToScreen(page, 76 + 54, 60 + 71);
    await page.mouse.click(p.x, p.y);
    const cross = await page.evaluate(() => (window as unknown as { __calccanvas: { store: { getState(): { crosshair: { x: number; y: number } } } } }).__calccanvas.store.getState().crosshair);
    expect((cross.x - 76) % 10).toBe(0);
    expect((cross.y - 60) % 10).toBe(0);
  });
});
