import { expect, test } from '@playwright/test';
import { openFresh, region } from './helpers.js';

test('rectangular column template: load cases in Input & Results calculate UR for every case', async ({ page }) => {
  test.setTimeout(120_000);
  await openFresh(page, 'rc-rectangular-column');
  await page.evaluate(() => (window as unknown as { __calccanvas: { idle(): Promise<void> } }).__calccanvas.idle());
  const worksheetUR = (await region(page, '\\mathrm{UR}_{M}='))?.result ?? '';
  expect(worksheetUR).toMatch(/\d\.\d{3}/);
  await page.getByRole('tab', { name: 'Input & Results' }).click();
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(5);
  await page.getByTestId('calculate-all-batch').click();
  await expect(page.getByText('Current')).toHaveCount(5, { timeout: 90_000 });
  // LC1 is the worksheet's own design case: same utilisation as the worksheet.
  await expect(rows.first()).toContainText(worksheetUR.match(/\d\.\d{3}/)![0]);
  await expect(page.getByText('FAIL', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/ui-snapshots/rect-column-load-cases.png' });
});
