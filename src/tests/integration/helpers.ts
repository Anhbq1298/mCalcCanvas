import { expect, type Page } from '@playwright/test';

export interface RegionInfo {
  id: string;
  latex: string;
  result: string;
  error: string;
  status: string;
}

export async function regions(page: Page): Promise<RegionInfo[]> {
  return page.locator('[data-testid=math-region]').evaluateAll((els) =>
    els.map((e) => ({
      id: e.getAttribute('data-shape-id') ?? '',
      latex: e.getAttribute('data-latex') ?? '',
      result: e.getAttribute('data-result') ?? '',
      error: e.getAttribute('data-error') ?? '',
      status: e.getAttribute('data-status') ?? '',
    })),
  );
}

/** Find a region whose LaTeX starts with the given prefix. */
export async function region(page: Page, latexPrefix: string): Promise<RegionInfo | undefined> {
  return (await regions(page)).find((r) => r.latex.startsWith(latexPrefix));
}

export function resultOf(page: Page, latexPrefix: string) {
  return expect.poll(async () => (await region(page, latexPrefix))?.result ?? '<missing>', { timeout: 8000 });
}

export function errorOf(page: Page, latexPrefix: string) {
  return expect.poll(async () => (await region(page, latexPrefix))?.error ?? '<missing>', { timeout: 8000 });
}

export async function waitReady(page: Page) {
  await page.waitForFunction(() => !!(window as unknown as { __calccanvas?: unknown }).__calccanvas);
  await page.evaluate(() => (window as unknown as { __calccanvas: { loaded: Promise<void> } }).__calccanvas.loaded);
  await expect(page.getByTestId('save-state')).toHaveText('Saved to this browser', { timeout: 10_000 });
}

/** Fresh profile; the tests are written against the steel beam sample. */
export async function openFresh(page: Page, template = 'steel-beam') {
  await page.addInitScript(() => {
    // window.print would block headless runs; PDF is produced with page.pdf().
    window.print = () => {};
  });
  await page.goto(`/?template=${template}`);
  await waitReady(page);
}

export async function newBlankWorksheet(page: Page, mode: 'free' | 'page' = 'free') {
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'New worksheet', exact: true }).click();
  await expect(page.locator('[data-testid=math-region]')).toHaveCount(0);
  await waitReady(page);
  if (mode === 'free') {
    // These tests use absolute screen positions, so they work without page margins.
    await page.getByTestId('format-tab-document').click();
    await page.getByTestId('doc-pages').uncheck();
    await page.getByTestId('format-tab-math').click();
  }
}

/**
 * Place a math region with the Math tool and type into MathLive.
 * `keys` items wrapped in braces are key presses, e.g. "{ArrowRight}".
 */
export async function addRegion(page: Page, x: number, y: number, keys: string[]) {
  await page.getByTestId('tool-math').click();
  await page.mouse.click(x, y);
  await expect(page.locator('math-field')).toHaveCount(1);
  await page.waitForTimeout(50);
  await typeKeys(page, keys);
  await page.keyboard.press('Enter');
  await expect(page.locator('math-field')).toHaveCount(0);
}

export async function typeKeys(page: Page, keys: string[]) {
  for (const k of keys) {
    if (k.startsWith('{') && k.endsWith('}')) await page.keyboard.press(k.slice(1, -1));
    else await page.keyboard.type(k, { delay: 15 });
  }
}

/** Screen-space centre of a region element. */
export async function regionCenter(page: Page, id: string) {
  const box = await page.locator(`.math-region[data-shape-id="${id}"]`).boundingBox();
  if (!box) throw new Error(`Region ${id} not visible`);
  return { x: box.x + Math.min(box.width / 2, 30), y: box.y + box.height / 2 };
}

/** Double-click a region, replace its content and confirm. */
export async function editRegion(page: Page, id: string, keys: string[]) {
  const c = await regionCenter(page, id);
  await page.mouse.dblclick(c.x, c.y);
  await expect(page.locator('math-field')).toHaveCount(1);
  await page.waitForTimeout(50);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await typeKeys(page, keys);
  await page.keyboard.press('Enter');
  await expect(page.locator('math-field')).toHaveCount(0);
}

export async function shapePosition(page: Page, id: string) {
  return page.evaluate((shapeId) => {
    type Store = { getState(): { shapes: Record<string, { x: number; y: number }> } };
    const store = (window as unknown as { __calccanvas: { store: Store } }).__calccanvas.store;
    const s = store.getState().shapes[shapeId];
    return { x: s.x, y: s.y };
  }, id);
}
