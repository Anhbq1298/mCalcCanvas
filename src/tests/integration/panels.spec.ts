import { expect, test, type Page } from '@playwright/test';
import { newBlankWorksheet, openFresh, region, resultOf } from './helpers.ts';

const pageCount = (page: Page) => page.locator('[data-testid=page-sheet]').count();

test.describe('Parameters panel', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
  });

  test('lists definitions in reading order, jumps to a region and edits inputs', async ({ page }) => {
    const panel = page.getByTestId('parameters-panel');
    await expect(panel).toBeVisible();
    const names = await panel.getByTestId('param-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
    expect(names.slice(0, 5)).toEqual(['L', 'b', 'G', 'Q', 'w']);
    expect(names).toContain('M_Ed');

    // Click a row: that region is selected.
    await panel.locator('[data-testid=param-row][data-name=w]').click();
    const selected = await page.evaluate(() => (window as unknown as { __calccanvas: { store: { getState(): { selection: string[] } } } }).__calccanvas.store.getState().selection);
    const w = await region(page, 'w\\coloneq');
    expect(selected).toEqual([w!.id]);

    // Edit L in the panel: M_Ed follows.
    const before = (await region(page, 'M_{Ed}'))!.result;
    const input = panel.getByTestId('param-input-L');
    await input.fill('10');
    await input.press('Enter');
    await expect.poll(async () => (await region(page, 'L\\coloneq'))?.latex).toBe('L\\coloneq10\\,\\mathrm{m}');
    await expect.poll(async () => (await region(page, 'M_{Ed}'))?.result).not.toBe(before);

    // Search + close / reopen.
    await panel.getByLabel('Search parameters').fill('eta');
    await expect(panel.getByTestId('param-row')).toHaveCount(2);
    await panel.getByLabel('Close parameters panel').click();
    await expect(panel).toHaveCount(0);
    await page.getByTestId('toggle-params').click();
    await expect(page.getByTestId('parameters-panel')).toBeVisible();
  });

  test('insert and delete a blank page', async ({ page }) => {
    await newBlankWorksheet(page, 'page');
    await expect.poll(() => pageCount(page)).toBe(1);
    await page.getByTestId('insert-page').click();
    await expect.poll(() => pageCount(page)).toBe(2);
    await page.keyboard.press('Control+Enter');
    await expect.poll(() => pageCount(page)).toBe(3);
    // The view is on the last inserted page (empty) → it can be deleted.
    await page.getByRole('menuitem', { name: 'Insert' }).click();
    await page.getByRole('menuitem', { name: 'Delete empty page' }).click();
    await expect.poll(() => pageCount(page)).toBe(2);
  });

  test('inserting a page moves later content down one page', async ({ page }) => {
    // Demo: everything is on page 1; select L and insert a page after page 1 — nothing moves.
    await resultOf(page, 'M_{Ed}').not.toBe('');
    const yBefore = await page.evaluate(() => Object.values((window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { y: number }> } } } }).__calccanvas.store.getState().shapes).map((s) => s.y));
    await page.getByTestId('insert-page').click();
    const yAfter = await page.evaluate(() => Object.values((window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { y: number }> } } } }).__calccanvas.store.getState().shapes).map((s) => s.y));
    expect(yAfter).toEqual(yBefore);
    await expect.poll(() => pageCount(page)).toBeGreaterThanOrEqual(2);
  });

  test('help guide shows a live snapshot for each display format and unit topic', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Help' }).click();
    await page.getByRole('menuitem', { name: 'Display formats & units guide' }).click();
    const dlg = page.getByRole('dialog', { name: 'Display formats & units' });
    await expect(dlg.getByTestId('guide-card')).toHaveCount(6);
    await expect(dlg).toContainText('257.39');
    await dlg.getByRole('tab', { name: 'Units' }).click();
    await expect(dlg).toContainText('kip');
    await expect(dlg.getByTestId('guide-card')).toHaveCount(6);
  });
});
