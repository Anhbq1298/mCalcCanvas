import { expect, test } from '@playwright/test';
import { addRegion, newBlankWorksheet, openFresh, region, regions, resultOf } from './helpers.ts';

test.describe('Mathcad keys, constants, page chrome and text styling', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
    await newBlankWorksheet(page);
  });

  test('":" defines, "\\" is square root, "." starts a subscript, Ctrl+G makes Greek', async ({ page }) => {
    await addRegion(page, 300, 220, ['M.Ed', '{ArrowRight}', ':4']);
    await expect.poll(async () => (await regions(page))[0]?.latex).toMatch(/^M_\{Ed\}\\coloneq\s*4$/);
    await addRegion(page, 300, 300, ['r:', '\\', '16', '{ArrowRight}', '=']);
    await resultOf(page, 'r').toBe('4');
    await addRegion(page, 300, 380, ['a', '{Control+g}', ':2=']);
    await resultOf(page, '\\alpha').toBe('2');
  });

  test('Enter moves the + cursor below so the next region stacks', async ({ page }) => {
    await addRegion(page, 300, 220, ['x:1']);
    await expect(page.getByTestId('crosshair')).toBeVisible();
    await page.keyboard.type('y:2', { delay: 15 });
    await page.keyboard.press('Enter');
    const all = await regions(page);
    expect(all).toHaveLength(2);
    const pos = await page.evaluate(() => {
      const st = (window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { x: number; y: number; props: { latex: string } }> } } } }).__calccanvas.store.getState();
      return Object.values(st.shapes).map((s) => ({ latex: s.props.latex, x: s.x, y: s.y }));
    });
    const x = pos.find((p) => p.latex.startsWith('x'))!;
    const y = pos.find((p) => p.latex.startsWith('y'))!;
    expect(y.y).toBeGreaterThan(x.y);
    expect(Math.abs(y.x - x.x)).toBeLessThan(12);
  });

  test('if(condition, true, false) typed on the keyboard picks the branch', async ({ page }) => {
    await addRegion(page, 300, 220, ['N:2000kN']);
    await addRegion(page, 300, 300, ['c:if(N>0kN,1,2.5', '{ArrowRight}', '=']);
    await resultOf(page, 'c').toBe('1');
  });

  test('constants: g, π and % from the keyboard and the Constants palette', async ({ page }) => {
    await addRegion(page, 300, 220, ['W:10kg*g=']);
    await resultOf(page, 'W').toBe('0.0981 kN');
    // Constants palette inserts into the open equation
    await page.getByTestId('tool-math').click();
    await page.mouse.click(300, 320);
    await page.keyboard.type('c:2*', { delay: 15 });
    await page.getByTestId('palette-constants').click();
    await page.getByTestId('palette-π').click();
    await page.keyboard.type('=', { delay: 15 });
    await page.keyboard.press('Enter');
    await resultOf(page, 'c').toBe('6.28');
  });

  test('header/footer and grid show on the page and can be toggled', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'View' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Page layout' }).click();
    await expect(page.getByTestId('page-header').first()).toBeVisible();
    await expect(page.getByTestId('page-footer').first()).toContainText('Page 1 of 1');
    await expect(page.getByTestId('page-grid').first()).toBeVisible();
    await page.getByTestId('format-tab-document').click();
    await page.getByTestId('toggle-chrome').click();
    await expect(page.getByTestId('page-header')).toHaveCount(0);
    await page.getByTestId('toggle-grid').click();
    await expect(page.getByTestId('page-grid')).toHaveCount(0);
  });

  test('text font and colour', async ({ page }) => {
    await page.getByTestId('tool-text').click();
    await page.mouse.click(400, 300);
    await page.keyboard.type('Load case 1', { delay: 10 });
    await page.keyboard.press('Escape');
    await page.getByTestId('text-region').click();
    await page.getByTestId('format-tab-text-format').click();
    await page.getByTestId('text-font').selectOption('Times New Roman');
    await page.getByTestId('toggle-properties').click();
    await page.getByLabel('Text color hex code').fill('#c2410c');
    await page.getByLabel('Text color hex code').press('Enter');
    const style = await page.getByTestId('text-region').evaluate((el) => ({ font: getComputedStyle(el).fontFamily, color: getComputedStyle(el).color }));
    expect(style.font).toContain('Times New Roman');
    expect(style.color).toBe('rgb(194, 65, 12)');
  });
});

void region;
