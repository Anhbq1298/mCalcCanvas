import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { openFresh } from './helpers.js';

test('every calculation template prints compactly without changing editable geometry or calculation results', async ({ page }) => {
  test.setTimeout(120_000);
  for (const template of ['steel-beam', 'rc-beam', 'rc-rectangular-column', 'rc-circular-column']) {
    await openFresh(page, template);
    await page.evaluate(() => (window as unknown as { __calccanvas: { idle(): Promise<void> } }).__calccanvas.idle());
    await expect(page.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
    const snapshot = () => page.evaluate(() => JSON.stringify((window as unknown as { __calccanvas: { store: { getState(): { shapes: unknown } } } }).__calccanvas.store.getState().shapes));
    const before = await snapshot();
    const results = await page.getByTestId('math-region').evaluateAll(elements => elements.map(el => [el.getAttribute('data-latex'), el.getAttribute('data-result')]).sort().map(x => JSON.stringify(x)));
    await page.getByTestId('export-pdf').click();
    await expect(page.locator('#print-root .print-page').first()).toBeAttached();
    expect(await snapshot()).toBe(before);
    const printed = await page.locator('#print-root [data-testid=math-region]').evaluateAll(elements => elements.map(el => [el.getAttribute('data-latex'), el.getAttribute('data-result')]).sort().map(x => JSON.stringify(x)));
    expect(printed).toEqual(results);
    expect(await page.locator('#print-root [data-testid=graph]').evaluateAll(elements => elements.every(el => el.getAttribute('data-errors') === '0'))).toBe(true);
    if (process.env.UI_SNAPSHOTS) {
      const directory = 'test-results/ui-snapshots/templates';
      await mkdir(directory, { recursive: true });
      const printBefore = await snapshot();
      await page.emulateMedia({ media: 'print' });
      const sheets = page.locator('#print-root .print-page');
      for (let i = 0; i < await sheets.count(); i++) await sheets.nth(i).screenshot({ path: `${directory}/${template}-page-${i + 1}.png` });
      await page.pdf({ path: `${directory}/${template}.pdf`, preferCSSPageSize: true, printBackground: true });
      expect(await snapshot()).toBe(printBefore);
      await page.emulateMedia({ media: 'screen' });
    }
    if (template === 'rc-beam') {
      await page.getByTestId('format-tab-document').click();
      await page.getByTestId('doc-paper').selectOption('A3');
      await page.getByTestId('doc-landscape').click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const landscapeBefore = await snapshot();
      await page.getByTestId('export-pdf').click();
      await expect(page.locator('#print-root .print-page')).toHaveCount(1);
      await expect(page.locator('#print-root .print-page')).toHaveAttribute('data-paper', 'A3 landscape');
      await expect(page.locator('#print-root [data-testid=math-region]')).toHaveCount(results.length);
      expect(await snapshot()).toBe(landscapeBefore);
    }
  }
});
