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

test('mSteelBeamColumn report: hollow section with a hand C1 opens in mCalcCanvas with the page result', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/steel/');
  await expect(page.getByTestId('overall-ur')).not.toHaveText('–', { timeout: 30_000 });
  await page.getByTestId('shape-RHS').click();
  await page.getByTestId('ltb-diagram').click();
  await page.getByTestId('ltb-psi').fill('-0.5');
  await page.getByTestId('ltb-psi-use').click();
  await expect(page.getByTestId('c1-shown')).toHaveText('2.330');
  const ur = (await page.getByTestId('overall-ur').textContent())!;
  const [report] = await Promise.all([context.waitForEvent('page'), page.getByTestId('open-report').click()]);
  await report.waitForFunction(() => !!(window as unknown as { __calccanvas?: unknown }).__calccanvas);
  await report.evaluate(async () => { const c = (window as unknown as { __calccanvas: { loaded: Promise<void>; idle(): Promise<void> } }).__calccanvas; await c.loaded; await c.idle(); });
  await expect(report.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
  const got = await report.evaluate(() => {
    const c = (window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { id: string; y: number; type: string; props: { latex?: string; html?: string } }> }; setState(s: unknown): void } } }).__calccanvas;
    const shapes = Object.values(c.store.getState().shapes);
    const gov = shapes.find((s) => s.type === 'math' && s.props.latex === '\\mathrm{UR}\\coloneq\\max\\left(\\mathrm{UR}_{6.2},\\mathrm{UR}_{6.3}\\right)')!;
    c.store.setState({ camera: { x: 0, y: gov.y - 200, z: 1 } });
    return { id: gov.id, c1: shapes.some((s) => s.props.latex === 'C_{1}\\coloneq 2.33'), text: shapes.filter((s) => s.type === 'text').map((s) => s.props.html).join(' ') };
  });
  expect(got.c1).toBe(true);
  expect(got.text).toContain('ψ = -0.5');
  // the governing UR of the report, recalculated by mCalcCanvas, is the page's
  await expect(report.locator(`[data-testid=math-region][data-shape-id="${got.id}"]`)).toContainText(ur);
});

test('mSteelBeamColumn moment diagram picker: SN003b cases with Table B.3 Cm, end-moment ratio and user C1, C2', async ({ page }) => {
  await page.goto('/steel/');
  await expect(page.getByTestId('overall-ur')).not.toHaveText('–', { timeout: 30_000 });
  await page.getByTestId('ltb-diagram').click();
  await page.getByTestId('ltb-case-10').click();
  await expect(page.getByTestId('ltb-diagram')).toHaveAttribute('title', /UDL, simply supported/);
  await expect(page.getByTestId('c1-shown')).toHaveText('1.127');
  await expect(page.getByTestId('c2-shown')).toHaveText('0.454');
  await expect(page.locator('input[data-input="Cmy"]')).toHaveValue('0.95');
  await expect(page.locator('input[data-input="CmLT"]')).toHaveValue('0.95');
  await page.getByTestId('ltb-diagram').click();
  await page.getByTestId('ltb-psi').fill('-0.5');
  await page.getByTestId('ltb-psi-use').click();
  await expect(page.getByTestId('c1-shown')).toHaveText('2.330');
  await expect(page.getByTestId('c2-shown')).toHaveText('0.000');
  await expect(page.locator('input[data-input="Cmy"]')).toHaveValue('0.4');
  await page.getByTestId('ltb-diagram').click();
  await page.getByTestId('ltb-c1').fill('2.2');
  await page.getByTestId('ltb-c2').fill('0.3');
  await page.getByTestId('ltb-user-use').click();
  await expect(page.getByTestId('c1-shown')).toHaveText('2.200');
  await expect(page.getByTestId('c2-shown')).toHaveText('0.300');
  await expect(page.getByTestId('member-props')).toContainText('M');
});

test('mSteelBeamColumn middle column: main formulas of the shown combination, read only', async ({ page }) => {
  await page.goto('/steel/');
  const sheet = page.getByTestId('sheet');
  await expect(sheet.locator('.f-math').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#h-sheet')).toContainText('ULS2');
  for (const h of ['5.1 Shear (§6.2.6, §6.2.8)', '6. Bending, shear and axial force (§6.2.9)', '7. Compression: flexural buckling y-y (§6.3.1)', '8. Lateral-torsional buckling (§6.3.2)', '9. Compression and bending (§6.3.3, Annex B)']) await expect(sheet).toContainText(h);
  expect(await sheet.locator('.f-math.err').count()).toBe(0);
  expect(await sheet.locator('input, textarea, math-field, [contenteditable=true]').count()).toBe(0);
  // the (6.62) line carries the combination's value and the governing UR
  const row = sheet.locator('tr', { hasText: '(6.62)' });
  await expect(row).toContainText('1.381');
  await page.getByTestId('combos').locator('tbody tr').first().click();
  await expect(page.locator('#h-sheet')).toContainText('ULS1');
  await expect(sheet.locator('tr', { hasText: 'Governing' })).toContainText('1.234');
});
