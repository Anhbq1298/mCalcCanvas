import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { openFresh, region, resultOf } from './helpers.ts';

test.describe('Steel beam-column template', () => {
  test('evaluates without errors; the section library sets the ID and the buckling curves follow', async ({ page }) => {
    test.setTimeout(90_000);
    await openFresh(page, 'steel-beam-column');
    await page.evaluate(() => (window as unknown as { __calccanvas: { idle(): Promise<void> } }).__calccanvas.idle());
    await expect(page.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
    // JRC member geometry and actions, with conservative Cm = 1 (independent Python reference).
    await resultOf(page, '\\mathrm{UR}\\coloneq').toBe('0.4618');
    await resultOf(page, '\\delta_{scope}\\coloneq').toBe('1');
    const memberRegion = await region(page, '\\delta_{scope}\\mathrm{if}');
    const memberBadge = page.locator(`[data-shape-id="${memberRegion!.id}"]`).getByTestId('check-badge');
    await expect(memberBadge).toHaveText('PASS');
    for (const name of ['C_{my}', 'C_{mz}', 'C_{mLT}']) await resultOf(page, `${name}\\coloneq`).toBe('1');
    await expect(page.getByText('Conservative defaults: Cmy = Cmz = CmLT = 1.0; no moment-gradient benefit is taken.', { exact: true })).toBeAttached();
    await resultOf(page, '\\alpha_{LT}\\coloneq').toBe('0.21');
    const designation = page.locator('[data-testid=section-designation]').filter({ visible: true });
    await expect(designation).toHaveText('Section := HEB 320');

    await page.getByTestId('browse-steel').click();
    const dlg = page.getByRole('dialog', { name: 'Steel Section Library' });
    await dlg.getByLabel('Section family').selectOption('IPE');
    await dlg.getByLabel('Search sections').fill('IPE 500');
    await dlg.getByRole('button', { name: /^IPE 500/ }).click();
    await dlg.getByTestId('select-steel').click();
    await expect(dlg).toBeHidden();
    await resultOf(page, '\\mathrm{Section}\\coloneq').toBe('1015');
    await resultOf(page, 'h\\coloneq').toBe('500 mm');
    await expect(designation).toHaveText('Section := IPE 500');
    // h/b = 2.5 > 2: curve b for LTB, curves a / b for flexural buckling.
    await resultOf(page, '\\alpha_{LT}\\coloneq').toBe('0.34');
    await resultOf(page, '\\alpha_{y}\\coloneq').toBe('0.21');
    await expect(page.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);

    await test.step('custom I/H previews properties, validates geometry and applies welded curves in one undo step', async () => {
      await page.getByTestId('browse-steel').click();
      await dlg.getByRole('tab', { name: 'Custom I/H', exact: true }).click();
      for (const [key, value] of Object.entries({ h: '600', b: '200', tf: '20', tw: '200' })) await dlg.getByLabel(`${key} [mm]`, { exact: true }).fill(value);
      await expect(dlg.getByRole('alert')).toHaveText('b must be greater than tw.');
      await expect(dlg.getByTestId('select-steel')).toBeDisabled();
      await dlg.getByLabel('tw [mm]', { exact: true }).fill('10');
      await expect(dlg.getByTestId('section-property-A')).toContainText('13600.0');
      await expect(dlg.getByTestId('section-property-mass')).toContainText('106.760');
      if (process.env.UI_SNAPSHOTS) {
        await mkdir('test-results/ui-snapshots', { recursive: true });
        await dlg.screenshot({ path: 'test-results/ui-snapshots/steel-custom-section.png' });
      }
      await dlg.getByTestId('select-steel').click();
      await resultOf(page, '\\mathrm{Section}\\coloneq').toBe('0');
      await resultOf(page, 'h\\coloneq').toBe('600 mm');
      await expect(designation).toHaveText('Section := Custom welded I/H');
      await resultOf(page, '\\alpha_{LT}\\coloneq').toBe('0.76');
      await resultOf(page, '\\alpha_{y}\\coloneq').toBe('0.34');
      await resultOf(page, '\\delta_{scope}\\coloneq').toBe('0');
      await expect(memberBadge).toHaveText('FAIL');
      await expect(page.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
      await page.getByTestId('quick-undo').click();
      await resultOf(page, '\\mathrm{Section}\\coloneq').toBe('1015');
      await resultOf(page, 'h\\coloneq').toBe('500 mm');
      await page.getByTestId('quick-redo').click();
      await resultOf(page, 'h\\coloneq').toBe('600 mm');
      if (process.env.UI_SNAPSHOTS) {
        await page.evaluate(() => (window as unknown as { __calccanvas: { idle(): Promise<void> } }).__calccanvas.idle());
        await page.getByTestId('export-pdf').click();
        await expect(page.locator('#print-root .print-page').first()).toBeAttached();
        await expect(page.locator('#print-root [data-testid=math-region][data-status=error]')).toHaveCount(0);
        await expect(page.locator('#print-root')).toContainText('Custom welded I/H');
        await page.emulateMedia({ media: 'print' });
        await page.pdf({ path: 'test-results/ui-snapshots/steel-custom-section.pdf', preferCSSPageSize: true, printBackground: true });
        await page.emulateMedia({ media: 'screen' });
      }
    });

    await test.step('custom dimensions survive reload and can be replaced by a library section', async () => {
      await expect(page.getByTestId('save-state')).toHaveText('Saved');
      await page.reload();
      await resultOf(page, '\\mathrm{Section}\\coloneq').toBe('0');
      await resultOf(page, 'h\\coloneq').toBe('600 mm');
      await expect(designation).toHaveText('Section := Custom welded I/H');
      await page.getByTestId('browse-steel').click();
      await expect(dlg.getByRole('tab', { name: 'Custom I/H', exact: true })).toHaveAttribute('aria-selected', 'true');
      for (const [key, value] of Object.entries({ h: '600', b: '200', tf: '20', tw: '10' })) await expect(dlg.getByLabel(`${key} [mm]`, { exact: true })).toHaveValue(value);
      await dlg.getByRole('tab', { name: 'Library', exact: true }).click();
      await dlg.getByLabel('Section family').selectOption('HEB');
      await dlg.getByLabel('Search sections').fill('HEB 320');
      await dlg.getByRole('button', { name: /^HEB 320/ }).click();
      await dlg.getByTestId('select-steel').click();
      await resultOf(page, '\\mathrm{Section}\\coloneq').toBe('1211');
      await expect(designation).toHaveText('Section := HEB 320');
      await resultOf(page, '\\mathrm{UR}\\coloneq').toBe('0.4618');
    });

    await test.step('LTB table shows numeric coefficients and keeps their definitions editable', async () => {
      const info = await region(page, 'C_{1.6}\\coloneq');
      expect(info).toBeDefined();
      const coefficient = page.locator(`[data-testid=math-region][data-shape-id="${info!.id}"]`);
      await expect(coefficient).toHaveCount(1);
      await coefficient.evaluate(el => {
        type Store = { getState(): { shapes: Record<string, { y: number }> }; setState(value: { camera: { x: number; y: number; z: number } }): void };
        const store = (window as unknown as { __calccanvas: { store: Store } }).__calccanvas.store;
        store.setState({ camera: { x: 0, y: store.getState().shapes[el.getAttribute('data-shape-id')!].y - 250, z: 1 } });
      });
      await expect(coefficient.locator('.math-baseline')).toHaveText('2.050');
      await coefficient.dblclick();
      await expect(page.locator('math-field')).toHaveCount(1);
      await expect(page.locator('math-field')).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator('math-field')).toHaveCount(0);
      await expect(coefficient.locator('.math-baseline')).toHaveText('2.050');
      await resultOf(page, 'C_{1}\\coloneq').toBe('2.05');
    });
  });
});
