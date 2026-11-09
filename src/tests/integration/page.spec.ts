import { expect, test, type Page } from '@playwright/test';
import { newBlankWorksheet, openFresh, regions, stableBox } from './helpers.ts';

/** Screen rectangle of the writable area of page 1 (inside the margins). */
async function writable(page: Page) {
  return page.evaluate(() => {
    const st = (window as unknown as { __calccanvas: { store: { getState(): { camera: { x: number; y: number; z: number } } } } }).__calccanvas.store.getState();
    const canvas = document.querySelector('[data-testid=canvas]')!.getBoundingClientRect();
    const toScreen = (x: number, y: number) => ({ x: canvas.left + (x - st.camera.x) * st.camera.z, y: canvas.top + (y - st.camera.y) * st.camera.z });
    const tl = toScreen(76, 60);
    const br = toScreen(794 - 76, 1123 - 60);
    return { left: tl.x, top: tl.y, right: br.x, bottom: br.y };
  });
}

const shapes = (page: Page) =>
  page.evaluate(() =>
    Object.values((window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { x: number; y: number; type: string }> } } } }).__calccanvas.store.getState().shapes),
  );

test.describe('Page layout keeps content inside the margins', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
    await newBlankWorksheet(page, 'page');
  });

  test('typing/clicking outside the page does not create regions; inside does', async ({ page }) => {
    const w = await writable(page);
    // grey background left of the page
    await page.getByTestId('tool-math').click();
    await page.mouse.click(Math.max(5, w.left - 120), w.top + 100);
    await expect(page.locator('math-field')).toHaveCount(0);
    // double-click on the margin
    await page.getByTestId('format-tab-insert').click();
    await page.getByTestId('tool-select').click();
    await page.mouse.dblclick(w.left - 30, w.top + 200);
    await expect(page.locator('math-field')).toHaveCount(0);
    // inside the writable area
    await page.mouse.click(w.left + 60, w.top + 80);
    await page.keyboard.type('a:1', { delay: 15 });
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await regions(page)).length).toBe(1);
  });

  test('typing with the pointer off the page continues inside the margins', async ({ page }) => {
    await page.mouse.move(20, 600); // over the grey background
    await page.keyboard.type('x:2', { delay: 15 });
    await page.keyboard.press('Enter');
    const [s] = await shapes(page);
    expect(s.x).toBeGreaterThanOrEqual(76);
    expect(s.y).toBeGreaterThanOrEqual(60);
  });

  test('dragging a region past the margin stops at the margin', async ({ page }) => {
    const w = await writable(page);
    await page.mouse.click(w.left + 100, w.top + 100);
    await page.keyboard.type('y:3', { delay: 15 });
    await page.keyboard.press('Enter');
    await expect(page.locator('math-field')).toHaveCount(0);
    const region = page.locator('.math-region').first();
    await expect(region).toHaveAttribute('data-status', 'valid');
    await region.click();
    const grip = await stableBox(page.getByTestId('grip'));
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(w.left - 300, w.top - 150, { steps: 10 });
    await page.mouse.up();
    const [s] = await shapes(page);
    expect(s.x).toBeCloseTo(76, 0);
    // Free positioning clamps the region itself to the top margin without snapping its baseline.
    expect(s.y).toBe(60);
  });

  test('Check button inserts an editable "□ ≤ 1" with the caret in the slot', async ({ page }) => {
    await page.mouse.click((await writable(page)).left + 60, (await writable(page)).top + 60);
    await page.getByTestId('insert-check').click();
    await page.keyboard.type('0.5', { delay: 15 });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('check-badge')).toHaveText('PASS');
  });
});
