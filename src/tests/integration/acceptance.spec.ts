import { expect, test } from '@playwright/test';
import {
  addRegion,
  editRegion,
  errorOf,
  newBlankWorksheet,
  openFresh,
  region,
  regionCenter,
  regions,
  resultOf,
  shapePosition,
  waitReady,
} from './helpers.ts';

test.describe('acceptance criteria', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
    await newBlankWorksheet(page);
  });

  test('A – free positioning: regions at unrelated positions drag independently', async ({ page }) => {
    await addRegion(page, 300, 200, ['a:=1']);
    await addRegion(page, 700, 520, ['b:=2']);
    await addRegion(page, 450, 680, ['c:=a+b=']);
    const all = await regions(page);
    expect(all).toHaveLength(3);

    for (const [i, r] of all.entries()) {
      const before = await shapePosition(page, r.id);
      const c = await regionCenter(page, r.id);
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await page.mouse.move(c.x + 60 + i * 10, c.y + 40, { steps: 8 });
      await page.mouse.up();
      const after = await shapePosition(page, r.id);
      expect(Math.round(after.x - before.x)).toBeGreaterThan(40);
      expect(Math.round(after.y - before.y)).toBeGreaterThan(20);
    }
    // still editable after moving
    const cRegion = (await region(page, 'c'))!;
    await editRegion(page, cRegion.id, ['c:=a*b=']);
    await resultOf(page, 'c').toBe('2');
  });

  test('B – variable definition and evaluation', async ({ page }) => {
    await addRegion(page, 300, 200, ['L:=8.5m']);
    await addRegion(page, 300, 280, ['L=']);
    await resultOf(page, 'L=').toBe('8.5 m');
  });

  test('C/D/E – dependent calculation, automatic recalculation, position independence', async ({ page }) => {
    await addRegion(page, 300, 200, ['L:=8.5m']);
    await addRegion(page, 300, 260, ['w:=25kN/m']);
    await addRegion(page, 300, 320, ['M:=w*L^2', '{ArrowRight}', '/8']);
    await addRegion(page, 300, 420, ['M=']);
    await resultOf(page, 'M=').toBe('225.78 kN·m');

    // D – change L, result follows without manual recalculation
    const L = (await region(page, 'L'))!;
    await editRegion(page, L.id, ['L:=10m']);
    await resultOf(page, 'M=').toBe('312.5 kN·m');

    // E – Mathcad order: sideways moves don't matter, but moving L below M is an error
    const c = await regionCenter(page, L.id);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 200, c.y, { steps: 10 });
    await page.mouse.up();
    await resultOf(page, 'M=').toBe('312.5 kN·m');
    const c2 = await regionCenter(page, L.id);
    await page.mouse.move(c2.x, c2.y);
    await page.mouse.down();
    await page.mouse.move(c2.x, c2.y + 380, { steps: 10 });
    await page.mouse.up();
    const pos = await shapePosition(page, L.id);
    const m = await shapePosition(page, (await region(page, 'M\\coloneq'))!.id);
    expect(pos.y).toBeGreaterThan(m.y);
    await errorOf(page, 'M\\coloneq').toMatch(/^Variable "L" is defined below this equation/);
    // drag it back up: fixed again
    const c3 = await regionCenter(page, L.id);
    await page.mouse.move(c3.x, c3.y);
    await page.mouse.down();
    await page.mouse.move(c3.x, c3.y - 380, { steps: 10 });
    await page.mouse.up();
    await resultOf(page, 'M=').toBe('312.5 kN·m');
  });

  test('F – mm input is dimensionally correct and shown in kN·m', async ({ page }) => {
    await addRegion(page, 300, 200, ['L:=8500mm']);
    await addRegion(page, 300, 260, ['w:=25kN/m']);
    await addRegion(page, 300, 320, ['M:=w*L^2', '{ArrowRight}', '/8=']);
    await resultOf(page, 'M').toBe('225.78 kN·m');
  });

  test('G – unit mismatch is reported', async ({ page }) => {
    await addRegion(page, 300, 200, ['A:=10m+5kN']);
    await errorOf(page, 'A').toBe('Unit mismatch: Force (kN) cannot be added to Length (m).');
    // Only a symbol is shown; the message appears on hover.
    const icon = page.getByTestId('status-error');
    await expect(icon).toBeVisible();
    await expect(page.getByText('Unit mismatch: Force (kN) cannot be added to Length (m).')).toBeHidden();
    await icon.hover();
    await expect(page.getByRole('tooltip')).toHaveText('Unit mismatch: Force (kN) cannot be added to Length (m).');
    await expect(page.getByRole('tooltip')).toBeVisible();
    await expect(page.getByTestId('calc-status')).toContainText('1 with errors');
  });

  test('errors – undefined variable and circular dependency', async ({ page }) => {
    await addRegion(page, 300, 200, ['M:=w*2']);
    await errorOf(page, 'M').toBe('Variable "w" has not been defined above this equation.');
    await addRegion(page, 300, 300, ['A:=B+1']);
    await addRegion(page, 300, 380, ['B:=A+1']);
    await errorOf(page, 'A').toContain('Variable "B" is defined below this equation');
  });

  test('typing on an empty canvas creates a math region', async ({ page }) => {
    await page.mouse.click(500, 400);
    await page.keyboard.type('x:=3', { delay: 15 });
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await regions(page)).map((r) => r.latex)).toEqual([expect.stringMatching(/^x/)]);
  });
});

test('H – persistence: worksheet survives a reload and recalculates', async ({ page }) => {
  await openFresh(page);
  await newBlankWorksheet(page);
  await addRegion(page, 320, 220, ['L:=8.5m']);
  await addRegion(page, 520, 300, ['w:=25kN/m']);
  await addRegion(page, 320, 380, ['M:=w*L^2', '{ArrowRight}', '/8=']);
  const before = await regions(page);
  const positions = await Promise.all(before.map((r) => shapePosition(page, r.id)));
  await expect(page.getByTestId('save-state')).toHaveText('Saved to this browser', { timeout: 10_000 });

  await page.reload();
  await waitReady(page);
  const after = await regions(page);
  expect(after.map((r) => r.latex).sort()).toEqual(before.map((r) => r.latex).sort());
  for (const [i, r] of before.entries()) {
    expect(await shapePosition(page, r.id)).toEqual(positions[i]);
  }
  await resultOf(page, 'M').toBe('225.78 kN·m');
});

test('demo worksheet: edit span, drag, change units, check, export PDF', async ({ page }, testInfo) => {
  await openFresh(page);
  // Fresh browser profile → the steel beam sample is created.
  await resultOf(page, 'w\\coloneq').toBe('28.5 kN/m');
  await resultOf(page, 'M_{Ed}').toBe('257.39 kN·m');
  await resultOf(page, 'V_{Ed}').toBe('121.13 kN');
  await resultOf(page, '\\eta_{M}\\coloneq').toBe('0.858');
  await expect(page.getByTestId('check-badge')).toHaveText('PASS');

  // 1–2: change L to 10 m
  const L = (await region(page, 'L\\coloneq'))!;
  await editRegion(page, L.id, ['L:=10m']);
  await resultOf(page, 'M_{Ed}').toBe('356.25 kN·m');
  await resultOf(page, 'V_{Ed}').toBe('142.5 kN');
  await expect(page.getByTestId('check-badge')).toHaveText('FAIL');

  // 3–4: drag L; results unchanged
  const c = await regionCenter(page, L.id);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 330, c.y + 10, { steps: 8 });
  await page.mouse.up();
  await resultOf(page, 'M_{Ed}').toBe('356.25 kN·m');

  // 5: change display unit of M_Ed
  const m = (await region(page, 'M_{Ed}'))!;
  const mc = await regionCenter(page, m.id);
  await page.mouse.click(mc.x, mc.y);
  await page.getByTestId('toggle-properties').click();
  await page.getByTestId('display-unit-input').fill('kN·mm');
  await page.getByTestId('display-unit-input').press('Enter');
  await resultOf(page, 'M_{Ed}').toBe('356250 kN·mm');

  // 6–7: saved and restored
  await expect(page.getByTestId('save-state')).toHaveText('Saved to this browser', { timeout: 10_000 });
  await page.reload();
  await waitReady(page);
  await resultOf(page, 'M_{Ed}').toBe('356250 kN·mm');

  // 8 (Test I): export
  await page.getByTestId('export-pdf').click();
  const pages = page.locator('#print-root .print-page');
  await expect(pages).toHaveCount(1);
  await expect(page.locator('#print-root [data-testid=math-region]').first()).toBeAttached();
  const exported = await page.locator('#print-root [data-testid=math-region]').evaluateAll((els) => els.map((e) => e.getAttribute('data-result')));
  expect(exported).toContain('356250 kN·mm');
  expect(exported).toContain('142.5 kN');
  await page.emulateMedia({ media: 'print' });
  const pdfPath = testInfo.outputPath('calculation.pdf');
  const pdf = await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
  expect(pdf.byteLength).toBeGreaterThan(10_000);
  if (process.env.PDF_OUT) await page.pdf({ path: process.env.PDF_OUT, format: 'A4', printBackground: true, preferCSSPageSize: true });
});
