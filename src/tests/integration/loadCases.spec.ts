import { expect, test } from '@playwright/test';
import { openFresh, region } from './helpers.js';

test('rectangular column template: load cases in Input & Results calculate UR for every case', async ({ page }) => {
  test.setTimeout(120_000);
  await openFresh(page, 'rc-rectangular-column');
  await page.evaluate(() => (window as unknown as { __calccanvas: { idle(): Promise<void> } }).__calccanvas.idle());
  const worksheetUR = (await region(page, '\\mathrm{UR}_{M}='))?.result ?? '';
  expect(worksheetUR).toMatch(/\d\.\d{3}/);
  await page.getByRole('tab', { name: 'Table In&Out' }).click();
  const rows = page.locator('tbody tr');
  await expect(rows).toHaveCount(5);
  await page.getByTestId('calculate-all-batch').click();
  await expect(page.getByText('Current')).toHaveCount(5, { timeout: 90_000 });
  // LC1 is the worksheet's own design case: same utilisation as the worksheet.
  await expect(rows.first()).toContainText(worksheetUR.match(/\d\.\d{3}/)![0]);
  await expect(page.getByText('FAIL', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/ui-snapshots/rect-column-load-cases.png' });
  // Switching to the sheet and back keeps the results current.
  await page.getByRole('tab', { name: 'CalcCanvas' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('tab', { name: 'Table In&Out' }).click();
  await expect(page.getByText('Results outdated')).toHaveCount(0);
  await expect(page.getByText('Current')).toHaveCount(5);
});

test('rectangular column: case reports print a summary and the full worksheet per case', async ({ page }) => {
  test.setTimeout(120_000);
  await openFresh(page, 'rc-rectangular-column');
  await page.getByRole('tab', { name: 'Table In&Out' }).click();
  await page.getByTestId('print-reports').click();
  const root = page.locator('#print-root');
  await expect(root.getByTestId('report-summary')).toBeAttached({ timeout: 60_000 });
  await expect(root.locator('[data-testid=report-summary] tbody tr')).toHaveCount(5);
  const sheets = await root.locator('section.print-page').count();
  const perCase = (sheets - 1) / 5;
  expect(Number.isInteger(perCase) && perCase > 5).toBe(true);
  // LC2's pages: its own N_Ed in the input region and its own utilisation.
  const lc2 = root.locator('section[data-case="LC2 max N"]');
  await expect(lc2).toHaveCount(perCase);
  await expect(lc2.locator('[data-latex^="N_{Ed}\\\\coloneq"]')).toHaveAttribute('data-latex', /coloneq6000/);
  await expect(lc2.locator('[data-latex^="\\\\mathrm{UR}_{M}="]')).toHaveAttribute('data-result', /0\.6366/);
  await expect(root.locator('[data-status=error]')).toHaveCount(0);
  // A single case.
  await page.getByRole('button', { name: 'Report for LC4 max My' }).click();
  await expect(root.locator('section[data-case="LC4 max My"]')).toHaveCount(perCase, { timeout: 60_000 });
  await expect(root.locator('section[data-case="LC2 max N"]')).toHaveCount(0);
});

test('rectangular column: right-click a case to show it in CalcCanvas', async ({ page }) => {
  test.setTimeout(60_000);
  await openFresh(page, 'rc-rectangular-column');
  await page.getByRole('tab', { name: 'Table In&Out' }).click();
  await page.getByTestId('case-row').nth(1).click({ button: 'right', position: { x: 20, y: 10 } });
  await expect(page.getByTestId('case-row').nth(1)).toHaveAttribute('aria-selected', 'true');
  const menu = page.getByTestId('row-menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: /in CalcCanvas$/ }).first().click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator('[data-testid=math-region][data-latex^="N_{Ed}\\\\coloneq"]')).toHaveAttribute('data-latex', /coloneq6000/);
  await page.evaluate(() => (window as unknown as { __calccanvas: { idle(): Promise<void> } }).__calccanvas.idle());
  await expect(page.locator('[data-testid=math-region][data-latex^="\\\\mathrm{UR}_{M}="]')).toHaveAttribute('data-result', /0\.6366/);
  // One undo step puts the worksheet's own values back.
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-testid=math-region][data-latex^="N_{Ed}\\\\coloneq"]')).toHaveAttribute('data-latex', /coloneq3000/);
});
