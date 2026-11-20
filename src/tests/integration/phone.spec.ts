import { devices, expect, test } from '@playwright/test';
import { openFresh } from './helpers.ts';

test.use({ ...devices['iPhone 13'], browserName: 'chromium' });

test('phone: panels are drawers, the page fills the width, header and status bar stay one row', async ({ page }, testInfo) => {
  await openFresh(page, 'composite-beam');
  // side panels closed; the sheet takes the whole width
  await expect(page.getByTestId('left-panel')).toHaveCount(0);
  const canvas = (await page.getByTestId('canvas').boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(canvas.width).toBeGreaterThan(vw - 4);
  // the page is zoomed to the width
  await expect.poll(() => page.evaluate(() => (window as unknown as { __calccanvas: { store: { getState(): { camera: { z: number } } } } }).__calccanvas.store.getState().camera.z)).toBeLessThan(0.6);
  // status bar on one line
  expect((await page.getByTestId('status-bar').boundingBox())!.height).toBeLessThanOrEqual(30);
  await page.screenshot({ path: testInfo.outputPath('phone-sheet.png') });
  // Outline opens as a drawer over the sheet, the backdrop closes it
  await page.getByTestId('toggle-outline').click();
  const drawer = page.getByTestId('left-panel');
  await expect(drawer).toBeVisible();
  expect((await page.getByTestId('canvas').boundingBox())!.width).toBeGreaterThan(vw - 4);
  await page.screenshot({ path: testInfo.outputPath('phone-outline.png') });
  await page.getByTestId('drawer-backdrop').click({ position: { x: vw - 20, y: 200 } });
  await expect(drawer).toHaveCount(0);
});
