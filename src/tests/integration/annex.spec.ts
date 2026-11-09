import { expect, test } from '@playwright/test';
import { newBlankWorksheet, openFresh } from './helpers.ts';

test.describe('annex links', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
    await newBlankWorksheet(page, 'page');
  });

  test('Math → Annex link adds the ANNEX page, a numbered block and a link that follows its title', async ({ page }) => {
    await page.getByTestId('insert-annex').click();
    // The new annex heading is being edited: name it.
    const editing = page.locator('.text-region--editing');
    await expect(editing).toBeFocused();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Bar coordinates');
    await page.keyboard.press('Escape');

    const link = page.locator('[data-annex=link]');
    await expect(link).toContainText('A.1 Bar coordinates');
    await expect(link).toContainText('see page 3');
    await expect(page.locator('[data-annex=start]')).toContainText('ANNEX');
    const heading = page.locator('[data-annex=heading]');
    await expect(heading).toContainText('A.1');
    await expect(heading).toContainText('calculated at the link · page 1');

    // Double-click the link: the annex heading comes into view and is selected.
    await link.scrollIntoViewIfNeeded();
    const box = (await link.boundingBox())!;
    await page.mouse.dblclick(box.x + 30, box.y + box.height / 2);
    await expect(heading).toBeInViewport();
    await expect(page.locator('[data-annex=link]')).not.toHaveClass(/text-region--editing/);
  });
});
