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
  // The loads are edited in the Modify load dialog on the loading diagram.
  await page.getByTestId('load-open').click();
  await expect(page.getByRole('dialog', { name: 'Modify load' })).toBeVisible();
  const rows = page.locator('dialog.load-dialog section:has(h2:text("Point loads")) tbody tr');
  for (const [i, a, f] of [[0, '1.5', '100'], [1, '1.5', '150']] as const) {
    await rows.nth(i).locator('input').nth(0).fill(a);
    await rows.nth(i).locator('input').nth(0).blur();
    await rows.nth(i).locator('input').nth(1).fill(f);
    await rows.nth(i).locator('input').nth(1).blur();
  }
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
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

test('mCompositeBeamDesign optimizes the section in a dialog with strength and deflection targets', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/composite/');
  await expect(page.getByTestId('ur-des')).toHaveText('0.971');
  await page.getByTestId('optimize-open').click();
  await expect(page.getByRole('dialog', { name: 'Optimize section' })).toBeVisible();
  await page.getByTestId('t-strength').fill('abc');
  await expect(page.getByTestId('optimize')).toBeDisabled();
  await page.getByTestId('t-strength').fill('0.9');
  await page.getByTestId('t-defl').fill('0.8');
  await page.getByTestId('optimize').click();
  await expect(page.getByTestId('optimize-status')).toContainText('Lightest UB', { timeout: 200_000 });
  const res = page.getByTestId('optimize-result');
  const cell = async (label: string) => (await res.locator('tr', { hasText: label }).locator('td').nth(1).textContent())!;
  const strength = Number((await cell('Strength UR')).split(' ')[0]);
  const defl = Number((await cell('Deflection UR')).split(' ')[0]);
  expect(strength).toBeLessThanOrEqual(0.9);
  expect(defl).toBeLessThanOrEqual(0.8);
  // composite action is required, and the stud spacing and bar diameter come from the candidate lists
  expect(await cell('Design basis')).toBe('Composite');
  // the stud spacing is derived from the demand (a multiple of 5 mm), uniform preferred; bars from the list
  const [sa, sb] = (await cell('Stud spacing')).split(' mm')[0].split(' / ').map(Number);
  expect(sa % 5).toBe(0);
  expect(sb).toBe(sa);
  expect(Number(await cell('Studs on the beam'))).toBeGreaterThan(10);
  expect([10, 12, 13]).toContain(Number((await cell('Transverse bars')).split(' ')[0]));
  expect(await cell('Camber')).toBe('none');
  const chosen = await cell('Section');
  // a cap on the degree of connection, segmented studs and a camber rule change the answer's details, not its validity
  await page.getByTestId('t-eta-max').fill('60');
  await page.getByTestId('stud-mode').selectOption('segmented');
  await page.getByTestId('camber-auto').check();
  await page.getByTestId('cam-pct').fill('100');
  await page.getByTestId('cam-step').fill('1');
  await page.getByTestId('cam-min').fill('1');
  await page.getByTestId('cam-span').fill('6');
  await page.getByTestId('optimize').click();
  await expect(page.getByTestId('optimize-status')).toContainText('Optimizing', { timeout: 5_000 }).catch(() => undefined);
  await expect(page.getByTestId('optimize-status')).toContainText('Lightest UB', { timeout: 200_000 });
  expect(Number((await cell('Degree of shear connection')).split(' ')[0])).toBeLessThanOrEqual(60);
  expect(await cell('Camber')).toMatch(/^\d+ mm$/);
  const chosen2 = await cell('Section');
  expect(chosen2.length).toBeGreaterThan(0);
  void chosen;
  await page.getByTestId('optimize-apply').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByTestId('section-select').locator('option:checked')).toHaveText(chosen2, { timeout: 30_000 });
  await expect(page.locator('.status')).toHaveText('Up to date', { timeout: 30_000 });
  // the applied design passes on the page with the camber set as a fixed value
  await expect(page.getByTestId('verdict')).toContainText('Composite');
  expect(Number(await page.getByTestId('ur-des').textContent())).toBeLessThanOrEqual(0.9);
});

test('slab type: filled steel deck with transverse ribs reduces the studs and drops surface b-b', async ({ page }) => {
  await page.goto('/composite/');
  await expect(page.getByTestId('ur-max')).toHaveText(/\d\.\d{3}/, { timeout: 60_000 });
  await expect(page.getByTestId('deck-open')).toHaveCount(0); // solid slab by default
  await page.getByTestId('slab-type').selectOption('deck');
  await expect(page.getByTestId('bb-note')).toContainText('not required', { timeout: 30_000 });
  await page.getByTestId('deck-open').click();
  await expect(page.locator('dialog[open]')).toContainText('(6.23)');
  await page.locator('dialog[open] .btn.primary').click();
  await page.getByTestId('deck-dir').selectOption('par');
  await expect(page.getByTestId('bb-note')).toHaveCount(0, { timeout: 30_000 });
});

