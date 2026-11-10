import { expect, test } from '@playwright/test';
import { openFresh, resultOf } from './helpers.ts';

test.describe('Steel beam-column template', () => {
  test('evaluates without errors; the section library sets the ID and the buckling curves follow', async ({ page }) => {
    test.setTimeout(90_000);
    await openFresh(page, 'steel-beam-column');
    await page.evaluate(() => (window as unknown as { __calccanvas: { idle(): Promise<void> } }).__calccanvas.idle());
    await expect(page.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
    // Default data: JRC worked example (HEB 320): governing interaction (6.62) = 0.46.
    await resultOf(page, '\\mathrm{UR}\\coloneq').toBe('0.4571');
    await resultOf(page, '\\alpha_{LT}\\coloneq').toBe('0.21');

    await page.getByTestId('browse-steel').click();
    const dlg = page.getByRole('dialog', { name: 'Steel Section Library' });
    await dlg.getByLabel('Section family').selectOption('IPE');
    await dlg.getByLabel('Search sections').fill('IPE 500');
    await dlg.getByRole('button', { name: /^IPE 500/ }).click();
    await dlg.getByTestId('select-steel').click();
    await expect(dlg).toBeHidden();
    await resultOf(page, '\\mathrm{Section}\\coloneq').toBe('1015');
    await resultOf(page, 'h\\coloneq').toBe('500 mm');
    // h/b = 2.5 > 2: curve b for LTB, curves a / b for flexural buckling.
    await resultOf(page, '\\alpha_{LT}\\coloneq').toBe('0.34');
    await resultOf(page, '\\alpha_{y}\\coloneq').toBe('0.21');
    await expect(page.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
  });
});
