import { expect, test, type Page } from '@playwright/test';
import { newBlankWorksheet, openFresh, resultOf, regions } from './helpers.ts';

async function enterLatex(page: Page, latex: string, y: number) {
  await page.getByTestId('tool-math').click();
  await page.mouse.click(350, y);
  const field = page.locator('math-field');
  await expect(field).toHaveCount(1);
  await field.evaluate((element, value) => {
    (element as HTMLElement & { value: string }).value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, latex);
  await expect(field).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(field).toHaveCount(0);
}

test('matrix literals calculate in the worker, render, and survive reopening', async ({ page }) => {
  await openFresh(page);
  await newBlankWorksheet(page);
  await enterLatex(page, 'A\\coloneq\\begin{bmatrix}4&1\\\\2&3\\end{bmatrix}', 230);
  await enterLatex(page, '\\det(A)=', 360);
  await enterLatex(page, 'A^{-1}=', 450);
  await enterLatex(page, 'A^{T}=', 570);
  await resultOf(page, '\\det').toBe('10');
  await expect.poll(async () => (await regions(page)).find((r) => r.latex.startsWith('A^{-1}'))?.result).toContain('0.3');
  await expect.poll(async () => (await regions(page)).filter((r) => r.status === 'valid').length).toBe(4);
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  await page.reload();
  await resultOf(page, '\\det').toBe('10');
  await expect.poll(async () => (await regions(page)).filter((r) => r.status === 'valid').length).toBe(4);
});

test('Matrices ribbon inserts working operators and multi-argument functions', async ({ page }) => {
  await openFresh(page);
  await newBlankWorksheet(page);
  await enterLatex(page, 'A\\coloneq\\begin{bmatrix}4&1\\\\2&3\\end{bmatrix}', 230);
  await page.getByTestId('format-tab-matrices').click();
  await page.getByTestId('matrix-functions').click();
  for (const name of ['Cholesky', 'LU', 'QR', 'svd', 'geninv', 'eigenvals', 'lookup', 'deconvolve']) await expect(page.getByRole('button', { name, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'lsolve', exact: true }).click();
  // With no active editor the function becomes a new region; its arity must be correct.
  await expect.poll(async () => (await regions(page)).find((r) => r.latex.includes('lsolve'))?.latex).toMatch(/placeholder.*,.+placeholder/);
  await page.keyboard.press('Escape');
  await page.getByTestId('format-tab-math').click();
  await page.getByTestId('tool-math').click();
  await page.mouse.click(350, 480);
  await expect(page.locator('math-field')).toBeFocused();
  await page.keyboard.type('A');
  await page.keyboard.press('ControlOrMeta+a');
  await page.getByTestId('format-tab-matrices').click();
  await page.getByTestId('matrix-operators').click();
  await page.getByRole('button', { name: 'Transpose', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('=');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await regions(page)).find((r) => r.latex.includes('^{T}'))?.status).toBe('valid');
});
