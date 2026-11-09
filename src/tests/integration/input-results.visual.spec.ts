import { expect, test } from '@playwright/test';
import { openFresh } from './helpers.js';

test('capture the Input & Results workspace at desktop and mobile widths', async ({ page }) => {
  test.skip(!process.env.UI_SNAPSHOTS, 'Visual artifact capture runs in CI.');

  await openFresh(page, 'rc-column');
  await page.getByRole('tab', { name: 'Input & Results' }).click();
  await page.getByRole('button', { name: 'Configure columns' }).click();

  const inputs = page.getByRole('group', { name: 'Inputs · editable' });
  const outputs = page.getByRole('group', { name: 'Outputs · read only' });
  const inputChoices = inputs.locator('input[type="checkbox"]');
  const outputChoices = outputs.locator('input[type="checkbox"]');

  await expect(inputChoices.first()).toBeVisible();
  for (const index of [0, 1, 5, 6, 7, 8]) {
    await inputChoices.nth(index).check();
  }

  const outputCount = await outputChoices.count();
  for (let index = Math.max(0, outputCount - 4); index < outputCount; index += 1) {
    await outputChoices.nth(index).check();
  }

  await page.getByRole('button', { name: 'Apply columns' }).click();
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: 'Add row' }).click();
  }
  await page.getByTestId('calculate-all-batch').click();
  await expect(page.getByText('Current').first()).toBeVisible();

  await page.screenshot({
    path: 'test-results/ui-snapshots/input-results-desktop.png',
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'test-results/ui-snapshots/input-results-mobile.png',
    fullPage: true,
  });
});
