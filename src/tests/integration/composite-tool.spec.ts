import { expect, test } from '@playwright/test';

// mCompositeBeamDesign: the design page runs the composite worksheet; its report opens in mCalcCanvas.
test('mCompositeBeamDesign calculates, follows a large point load and hands the report to mCalcCanvas', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/composite/');
  await expect(page.getByTestId('ur-des')).toHaveText('0.971');
  await expect(page.getByTestId('verdict')).toContainText('Composite');
  // An invalid entry is flagged next to the field and not sent to the calculation.
  const span = page.locator('input[data-input="L"]');
  await span.fill('8,o');
  await span.blur();
  await expect(span).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Error: enter a number')).toBeVisible();
  await expect(page.getByTestId('ur-des')).toHaveText('0.971');
  await span.fill('8');
  await span.blur();
  await expect(span).toHaveAttribute('aria-invalid', 'false');
  const rows = page.locator('section:has(h2:text("Point loads")) tbody tr');
  for (const [i, a, f] of [[0, '1.5', '100'], [1, '1.5', '150']] as const) {
    await rows.nth(i).locator('input').nth(0).fill(a);
    await rows.nth(i).locator('input').nth(0).blur();
    await rows.nth(i).locator('input').nth(1).fill(f);
    await rows.nth(i).locator('input').nth(1).blur();
  }
  await expect(page.getByTestId('verdict')).toContainText('Bare steel');
  await expect(page.getByTestId('basis-note')).toBeVisible();
  await page.getByTestId('section-select').selectOption({ label: 'UB 533x210x92' });
  await expect(page.getByTestId('ur-des')).toHaveText('0.925');
  const [report] = await Promise.all([context.waitForEvent('page'), page.getByTestId('open-report').click()]);
  await report.waitForLoadState();
  await report.waitForFunction(() => !!(window as unknown as { __calccanvas?: unknown }).__calccanvas);
  await report.evaluate(() => (window as unknown as { __calccanvas: { idle(): Promise<void> } }).__calccanvas.idle());
  await expect(report.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
  await expect(report.locator('[data-testid=math-region][data-latex^="\\\\mathrm{Section}\\\\coloneq3129"]')).toHaveCount(1);
  await expect(report.locator('[data-testid=math-region][data-latex^="\\\\mathrm{UR}_{des}\\\\le"]').first()).toBeAttached();
});
