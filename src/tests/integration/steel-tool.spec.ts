import { expect, test } from '@playwright/test';

// mSteelBeamColumn: section design page on the Steel_Section_*_EC3 worksheets; its report opens in mCalcCanvas.
test('mSteelBeamColumn checks every combination, reads ETABS rows, finds the lightest section and hands the report over', async ({ page, context }) => {
  test.setTimeout(180_000);
  await page.goto('/steel/');
  // default: UC 305x305x97 S355 (Class 3 flange), L = 4 m, three combinations; ULS2 governs by (6.62)
  await expect(page.getByTestId('overall-ur')).toHaveText('1.381', { timeout: 30_000 });
  await expect(page.getByTestId('ur-0')).toHaveText('1.234');
  await expect(page.getByTestId('section-drawing')).toBeVisible();
  await expect(page.getByTestId('check-sec')).toHaveText('1.179');
  await expect(page.getByTestId('check-6.62')).toHaveText('1.381');
  // ETABS frame forces: the last six numbers are P V2 V3 T M2 M3 (P tension positive)
  await page.getByTestId('paste-open').click();
  await page.getByTestId('paste-format').selectOption('etabs');
  await page.getByTestId('paste-text').fill(['Story1\tC1\t12\tULS1\tCombination\t0\t-1800\t60\t8\t0.2\t12\t150', 'Story1\tC1\t12\tULS2\tCombination\t0\t-900\t110\t20\t0.1\t30\t210'].join('\n'));
  await expect(page.getByRole('dialog')).toContainText('2 rows read');
  await page.getByTestId('paste-replace').click();
  await expect(page.getByTestId('combos').locator('tbody tr')).toHaveCount(2);
  await expect(page.locator('input[aria-label="Name, row 1"]')).toHaveValue('Story1 C1 ULS1 Combination');
  await expect(page.locator('input[data-input="N_Ed row 1"]')).toHaveValue('1800');
  await expect(page.locator('input[data-input="M_y,Ed row 2"]')).toHaveValue('210');
  // lightest UC that passes both rows
  await page.getByTestId('design-run').click();
  await expect(page.getByTestId('design-apply')).toBeVisible({ timeout: 60_000 });
  const name = (await page.getByTestId('design-apply').textContent())!.replace(/^Use /, '');
  await page.getByTestId('design-apply').click();
  await expect(page.getByTestId('section-select').locator('option:checked')).toHaveText(name);
  const ur = Number(await page.getByTestId('overall-ur').textContent());
  expect(ur).toBeLessThanOrEqual(1);
  // hollow sections calculate too
  await page.getByTestId('shape-RHS').click();
  await expect(page.getByTestId('overall-ur')).not.toHaveText('–');
  await page.getByTestId('shape-CHS').click();
  await expect(page.getByTestId('overall-ur')).not.toHaveText('–');
  await page.getByTestId('shape-I').click();
  await expect(page.locator('#verdict')).toContainText('Governing: Story1 C1 ULS1');
  const [report] = await Promise.all([context.waitForEvent('page'), page.getByTestId('open-report').click()]);
  await report.waitForLoadState();
  await report.waitForFunction(() => !!(window as unknown as { __calccanvas?: unknown }).__calccanvas);
  await report.evaluate(async () => { const c = (window as unknown as { __calccanvas: { loaded: Promise<void>; idle(): Promise<void> } }).__calccanvas; await c.loaded; await c.idle(); });
  await expect(report.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
  await expect(report.locator('[data-testid=math-region]').first()).toBeAttached();
  const latex = await report.evaluate(() => Object.values((window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { type: string; props: { latex?: string } }> } } } }).__calccanvas.store.getState().shapes).flatMap((s) => (s.type === 'math' ? [s.props.latex ?? ''] : [])));
  // the governing combination of the lightest UC (ULS1, the larger axial force) is written into the sheet
  expect(latex).toContain('M_{y.Ed}\\coloneq 150\\,\\mathrm{kN}\\cdot\\mathrm{m}');
  expect(latex).toContain('N_{Ed}\\coloneq 1800\\,\\mathrm{kN}');
});

test('mSteelBeamColumn verification examples: published values agree with the sheet and go into the report', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/steel/');
  await expect(page.getByTestId('overall-ur')).not.toHaveText('–', { timeout: 30_000 });
  for (const id of ['p364-10', 'p374-5', 'staad-chs']) {
    await page.getByTestId('example').selectOption(id);
    const rows = page.getByTestId('verification').locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    await expect(page.getByTestId('verification').locator('td.fail')).toHaveCount(0);
    expect(await page.getByTestId('verification').locator('td.pass').count()).toBe(await rows.count());
  }
  // a manual change leaves the example
  await page.locator('input[data-input="N_Ed row 1"]').fill('100');
  await page.locator('input[data-input="N_Ed row 1"]').blur();
  await expect(page.getByTestId('verification')).toHaveCount(0);
  await page.getByTestId('example').selectOption('p364-3');
  await expect(page.getByTestId('check-LT')).toHaveText(/^0\.89/);
  const [report] = await Promise.all([context.waitForEvent('page'), page.getByTestId('open-report').click()]);
  await report.waitForFunction(() => !!(window as unknown as { __calccanvas?: unknown }).__calccanvas);
  await report.evaluate(async () => { const c = (window as unknown as { __calccanvas: { loaded: Promise<void>; idle(): Promise<void> } }).__calccanvas; await c.loaded; await c.idle(); });
  await expect(report.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
  const html = await report.evaluate(() => Object.values((window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { type: string; props: { html?: string } }> } } } }).__calccanvas.store.getState().shapes).flatMap((s) => (s.type === 'text' ? [s.props.html ?? ''] : [])).join('\n'));
  expect(html).toContain('Verification: I/H bending + LTB');
  expect(html).not.toContain('differs');
});
