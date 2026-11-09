import { expect, test } from '@playwright/test';
import { addRegion, newBlankWorksheet, openFresh } from './helpers.js';

const shot = (page: import('@playwright/test').Page, name: string) =>
  page.screenshot({ path: `test-results/ui-snapshots/worksheet-ux-${name}.png`, fullPage: true });

test('capture Mathcad-style worksheet interactions', async ({ page }) => {
  test.skip(!process.env.UI_SNAPSHOTS, 'Visual artifact capture runs on demand and in CI.');

  await openFresh(page);
  await newBlankWorksheet(page, 'page');
  await page.getByLabel('Close side panel').click();

  await addRegion(page, 330, 285, ['x:=125']);
  const equation = page.getByTestId('math-region').first();
  await equation.click();
  await expect(page.getByTestId('selection-outline')).toBeVisible();
  await shot(page, 'selected-equation');

  await page.getByTestId('tool-math').click();
  await page.mouse.click(330, 375);
  await page.keyboard.type('f:=');
  await page.getByTestId('palette-operators').click();
  await page.getByTestId('palette-a/b').click();
  await page.keyboard.type('1');
  await page.keyboard.press('Tab');
  await page.keyboard.type('2');
  await page.keyboard.press('Escape');

  await page.getByTestId('format-tab-matrices').click();
  await page.getByTestId('insert-matrix').click();
  await page.getByRole('gridcell', { name: '3 by 3' }).click();
  for (const value of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
    await page.keyboard.type(value);
    await page.keyboard.press('Tab');
  }
  await page.locator('math-field').evaluate((element) =>
    (element as HTMLElement & { executeCommand(command: string): void }).executeCommand('moveToMathfieldStart'),
  );
  await page.keyboard.type('M:=');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const matrix = page.locator('[data-testid=math-region][data-latex*="bmatrix"]');
  await matrix.click();
  await shot(page, 'selected-matrix');

  await page.getByTestId('format-tab-math').click();
  await page.getByTestId('tool-text').click();
  await page.mouse.click(560, 300);
  await page.keyboard.type('Design note: verify reinforcement spacing and cover requirements.', { delay: 8 });
  await page.keyboard.press('Escape');
  const text = page.getByTestId('text-region');
  await text.click();
  const handle = await page.getByTestId('handle-se').boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 70, handle!.y + 65, { steps: 6 });
  await page.mouse.up();
  await shot(page, 'resized-text');

  await page.getByTestId('tool-math').click();
  await page.mouse.click(560, 470);
  await page.keyboard.type('Maximum', { delay: 12 });
  await page.keyboard.press('Space');
  await page.keyboard.type('steel reinforcement', { delay: 12 });
  await expect(page.getByTestId('text-region').filter({ hasText: 'Maximum steel reinforcement' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('text-region').filter({ hasText: 'Maximum steel reinforcement' }).click();
  await shot(page, 'math-to-text');

  await page.getByTestId('format-tab-document').click();
  await page.getByRole('group', { name: 'Zoom' }).getByLabel('Zoom').selectOption('100');
  await shot(page, 'worksheet-100');
  await page.getByRole('group', { name: 'Zoom' }).getByLabel('Zoom').selectOption('150');
  await shot(page, 'worksheet-150');

  await page.getByTestId('export-pdf').click();
  await expect(page.locator('#print-root .print-page')).toHaveCount(1);
  await page.emulateMedia({ media: 'print' });
  await page.locator('#print-root .print-page').screenshot({
    path: 'test-results/ui-snapshots/worksheet-ux-print-page.png',
  });
  await page.pdf({
    path: 'test-results/ui-snapshots/worksheet-ux.pdf',
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
});
