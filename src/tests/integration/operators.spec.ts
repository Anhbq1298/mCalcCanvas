import { expect, test, type Page } from '@playwright/test';
import { newBlankWorksheet, openFresh } from './helpers.ts';

async function fillEditor(page: Page, latex: string) {
  const field = page.locator('math-field');
  await expect(field).toBeFocused();
  await field.evaluate((element, value) => {
    (element as HTMLElement & { value: string }).value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, latex);
  await page.keyboard.press('Enter');
  await expect(field).toHaveCount(0);
}

test('formerly disabled operators insert and evaluate through MathLive and the calculation worker', async ({ page }) => {
  test.setTimeout(120_000);
  await openFresh(page);
  const cases: [string, string, string | RegExp, string[]?][] = [
    ['x!', '5!=', '120'],
    ['+↲', '\\begin{array}{l}2+\\\\3\\end{array}=', '5'],
    ['−↲', '\\begin{array}{l}8-\\\\3\\end{array}=', '5'],
    ['·↲', '\\begin{array}{l}2\\cdot\\\\3\\end{array}=', '6'],
    ['÷↲', '\\begin{array}{l}8\\div\\\\2\\end{array}=', '4'],
    ['d/dx', '\\operatorname{derivative}(x^2,x,3)=', '6'],
    ['∂/∂x', '\\operatorname{partial}(x^2,x,3)=', '6'],
    ['∇', '\\operatorname{gradient}(x^2+3y^2,\\begin{bmatrix}x\\\\y\\end{bmatrix},\\begin{bmatrix}2\\\\3\\end{bmatrix})=', /4.*18/],
    ['∫dx', '\\int_{0}^{3}\\left(x^2\\right)\\,\\mathrm{d}x=', '9'],
    ['lim', '\\lim_{x\\to0}\\left(\\sin(x)/x\\right)=', '1'],
    ['∏', '\\prod_{i=1}^{4}\\left(i\\right)=', '24'],
    ['∑', '\\sum_{i=1}^{3}\\left(i^2\\right)=', '14'],
    ['x′', 'f^{\\prime}(3)=', '6', ['f(t)\\coloneq t^2']],
    ['⊛', '\\operatorname{convolution}(f,g,2,0,1)=', '0.75', ['f(t)\\coloneq t^2', 'g(t)\\coloneq t+1']],
    ['∗', '\\operatorname{convolve}(\\begin{bmatrix}1&2&3\\end{bmatrix},\\begin{bmatrix}1\\end{bmatrix})=', /1.*2.*3/],
    ['∈', '2\\in\\mathrm{seq}(1,3)=', '1'],
    ['⊕', '(2>1)\\oplus(3<4)=', '0'],
    ['∧', '(2>1)\\land(3<4)=', '1'],
    ['¬', '\\neg(2>1)=', '0'],
    ['∨', '(2<1)\\lor(3<4)=', '1'],
    ['z̄', '\\overline{3+4i}=', '3 − 4i'],
    ['∠', '\\operatorname{phasor}(2,0)=', '2'],
    ['∘', '\\operatorname{compose}(f,g,2)=', '9', ['f(t)\\coloneq t^2', 'g(t)\\coloneq t+1']],
    ['≡', '\\operatorname{global}(a,7)', '7', ['a=']],
    ['→', 'x+x\\rightarrow', /2[\s\u200b]*⋅[\s\u200b]*x/],
  ];
  for (const [label, latex, result, definitions = []] of cases) await test.step(label, async () => {
    await newBlankWorksheet(page);
    for (const [index, definition] of definitions.entries()) {
      await page.getByTestId('tool-math').click();
      await page.mouse.click(350, 230 + index * 100);
      await fillEditor(page, definition);
    }
    await page.getByTestId('palette-operators').click();
    const dialog = page.getByRole('dialog', { name: 'Operators', exact: true });
    await expect(dialog.locator('button:disabled')).toHaveCount(0);
    await dialog.getByTestId(`palette-${label}`).click();
    await fillEditor(page, latex);
    const region = page.getByTestId('math-region').last();
    await expect(region).toHaveAttribute('data-status', 'valid');
    if (label === '→') {
      await expect(region.locator('.math-baseline')).toContainText(result);
      await expect(region.locator('.math-baseline')).toContainText('→');
    }
    else await expect(region).toHaveAttribute('data-result', result);
    if (label === '≡') {
      await expect(page.getByTestId('math-region').first()).toHaveAttribute('data-result', '7');
      await expect(region.locator('.math-baseline')).toContainText('≡');
      await expect(page.getByTestId('save-state')).toHaveText('Saved');
      await page.reload();
      await expect(page.getByTestId('math-region').first()).toHaveAttribute('data-result', '7');
    }
  });
  await test.step('an operator wraps the actual editor selection', async () => {
    await newBlankWorksheet(page);
    await page.getByTestId('tool-math').click();
    await page.mouse.click(350, 230);
    await expect(page.locator('math-field')).toBeFocused();
    await page.keyboard.type('5');
    await page.keyboard.press('ControlOrMeta+a');
    await page.getByTestId('palette-operators').click();
    await page.getByTestId('palette-x!').click();
    await expect(page.locator('math-field')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('=');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('math-region')).toHaveAttribute('data-result', '120');
    await newBlankWorksheet(page);
    await page.getByTestId('tool-math').click();
    await page.mouse.click(350, 230);
    await expect(page.locator('math-field')).toBeFocused();
    await page.keyboard.type('5');
    await page.keyboard.press('ControlOrMeta+a');
    await page.getByTestId('palette-operators').click();
    await page.getByTestId('palette-+↲').click();
    await expect(page.locator('math-field')).toBeFocused();
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('math-region')).toHaveAttribute('data-result', '8');
  });
});
