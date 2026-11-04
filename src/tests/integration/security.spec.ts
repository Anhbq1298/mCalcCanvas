import { expect, test } from '@playwright/test';
import { newBlankWorksheet, openFresh } from './helpers.ts';

test('pasting HTML into a text region inserts only sanitised markup', async ({ page }) => {
  await openFresh(page);
  await newBlankWorksheet(page);
  await page.getByLabel('Close side panel').click();
  await page.getByTestId('tool-text').click();
  await page.mouse.click(500, 300);
  await expect(page.locator('.text-region--editing')).toBeFocused();
  const fired = await page.evaluate(() => {
    (window as unknown as { __pwned?: boolean }).__pwned = false;
    const el = document.querySelector('.text-region--editing')!;
    const dt = new DataTransfer();
    dt.setData('text/html', '<b onclick="window.__pwned=true">Bold</b><img src=x onerror="window.__pwned=true"><script>window.__pwned=true</script>');
    dt.setData('text/plain', 'Bold');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return el.innerHTML;
  });
  await page.waitForTimeout(200);
  expect(fired).toContain('<b>Bold</b>');
  expect(fired).not.toMatch(/onclick|onerror|<img|<script/);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: boolean }).__pwned)).toBe(false);
});
