import { expect, test } from '@playwright/test';
import { addRegion, editRegion, newBlankWorksheet, openFresh, resultOf } from './helpers.ts';

/** Region id of the math region whose LaTeX starts with `prefix`. */
async function regionId(page: import('@playwright/test').Page, prefix: string): Promise<string> {
  const id = await page.locator('[data-testid=math-region]').evaluateAll(
    (els, p) => els.find((e) => (e.getAttribute('data-latex') ?? '').startsWith(p))?.getAttribute('data-shape-id') ?? '',
    prefix,
  );
  if (!id) throw new Error(`No region starting with ${prefix}`);
  return id;
}

async function typeIn(page: import('@playwright/test').Page, testId: string, text: string) {
  const field = page.getByTestId(testId);
  await field.click();
  await expect(field).toBeFocused();
  await page.keyboard.type(text, { delay: 20 });
  await page.keyboard.press('Enter');
}

test.describe('ranges and graphs', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
    await newBlankWorksheet(page);
  });

  test('inputs (definitions from literals) are highlighted: light yellow, blue text', async ({ page }) => {
    await addRegion(page, 300, 220, ['L:8.5 m']);
    await addRegion(page, 300, 300, ['M:2L']);
    const input = page.locator('[data-testid=math-region][data-latex^="L"]');
    await expect(input).toHaveAttribute('data-input', 'true');
    await expect(input).toHaveCSS('background-color', 'rgb(255, 246, 191)');
    await expect(page.locator('[data-testid=math-region][data-latex^="M"]')).not.toHaveAttribute('data-input', 'true');
  });

  test('";" types a range and the result is a vector', async ({ page }) => {
    await addRegion(page, 300, 220, ['n:4']);
    await addRegion(page, 300, 280, ['i:0;n-1', '{ArrowRight}', '=']);
    await resultOf(page, 'i').toBe('[0, 1, 2, 3]');
  });

  test('long arrays show first 5 … last 5; double-click "…" shows all, Format → Array: row, short', async ({ page }) => {
    await addRegion(page, 300, 220, ['a:0;21']);
    await addRegion(page, 300, 300, ['a=']);
    await resultOf(page, 'a=').toBe('[0, 1, 2, 3, 4, …, 17, 18, 19, 20, 21] (22)');
    // Shapes are hit-tested by position on the canvas: use the mouse at the "…".
    const box = (await page.locator('.math-region .vec-more').first().boundingBox())!;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    await resultOf(page, 'a=').toBe('[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]');
    await expect(page.locator('[data-editing]')).toHaveCount(0);
    // Shorten again from Math formatting (the region is selected after the double-click).
    await expect(page.getByTestId('math-array')).toHaveValue('row-all');
    await page.getByTestId('math-array').selectOption('row-short');
    await resultOf(page, 'a=').toBe('[0, 1, 2, 3, 4, …, 17, 18, 19, 20, 21] (22)');
  });

  test('a graph from the Graph tab plots a series and redraws when an input changes; it prints', async ({ page }) => {
    await addRegion(page, 300, 200, ['n:4']);
    await addRegion(page, 300, 260, ['i:0;n-1']);
    await addRegion(page, 300, 320, ['y:i^2']);

    await page.getByTestId('format-tab-graph').click();
    await page.getByTestId('graph-insert').click();
    const graph = page.locator('[data-shape-type=graph] [data-testid=graph]');
    await expect(graph).toHaveCount(1);
    await expect(page.getByTestId('format-panel-graph')).toBeVisible();
    // House style: lemon background, axes through the origin, no grid.
    await expect(graph).toHaveAttribute('data-axes', 'origin');
    await expect(page.getByTestId('graph-background')).toHaveAttribute('fill', '#fff9c4');
    await expect(page.getByTestId('graph-grid')).toHaveAttribute('aria-pressed', 'false');

    await page.getByTestId('graph-add-series').click();
    await expect(page.getByTestId('properties-panel')).toBeVisible();
    await typeIn(page, 'series-0-x', 'i');
    await typeIn(page, 'series-0-y', 'y');

    const series = page.locator('[data-testid=graph-series]');
    await expect(series).toHaveAttribute('data-points', '4');
    // Series fields are hidden regions: the status bar counts only the 3 equations.
    await expect(page.getByTestId('calc-status')).toHaveText('3 regions · all calculated');

    // Where the data comes from: chips for the variables and the inputs behind them.
    await expect(page.getByTestId('series-0-uses-y')).toBeVisible();
    await expect(page.getByTestId('series-0-input-n')).toBeVisible();
    const nId = await regionId(page, 'n');
    await page.getByTestId('series-0-input-n').click();
    await expect(page.locator(`[data-shape-id="${nId}"][data-selected]`)).toHaveAttribute('data-selected', 'true');

    await editRegion(page, await regionId(page, 'n'), ['n:6']);
    await expect(series).toHaveAttribute('data-points', '6');

    // Select the graph again (editing the equation selected it).
    await page.locator('[data-shape-type=graph]').click({ position: { x: 150, y: 120 } });
    await expect(page.getByTestId('format-panel-graph')).toBeVisible();
    // Markers, an axis unit that does not fit (error box), then fixed.
    await page.getByTestId('series-0-style').selectOption('marker');
    await expect(series.locator('circle')).toHaveCount(6);
    await page.getByTestId('graph-xUnit').fill('mm');
    await page.getByTestId('graph-xUnit').press('Enter');
    await expect(page.locator('[data-testid=graph-error]')).toBeVisible();
    await page.getByTestId('graph-xUnit').fill('');
    await page.getByTestId('graph-xUnit').press('Enter');
    await expect(page.locator('[data-testid=graph-error]')).toHaveCount(0);

    // Graph edits are undoable: undo brings back the unit that did not fit.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('[data-testid=graph-error]')).toBeVisible();
    await page.keyboard.press('ControlOrMeta+y');
    await expect(page.locator('[data-testid=graph-error]')).toHaveCount(0);

    await page.getByTestId('export-pdf').click();
    await expect(page.locator('#print-root [data-testid=graph]')).toHaveCount(1);
    await expect(page.locator('#print-root [data-testid=graph-series]')).toHaveAttribute('data-points', '6');
  });
});
