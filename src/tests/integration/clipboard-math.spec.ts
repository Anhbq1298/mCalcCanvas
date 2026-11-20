import { expect, test, type Page } from '@playwright/test';
import { newBlankWorksheet, openFresh } from './helpers.ts';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const screenOf = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => {
  const cam = (window as unknown as { __calccanvas: { store: { getState(): { camera: { x: number; y: number; z: number } } } } }).__calccanvas.store.getState().camera;
  const r = document.querySelector('[data-testid=canvas]')!.getBoundingClientRect();
  return { x: r.left + (px - cam.x) * cam.z, y: r.top + (py - cam.y) * cam.z };
}, [x, y]);
const shapes = (page: Page) => page.evaluate(() => Object.values((window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { type: string; props: { latex?: string; html?: string } }> } } } }).__calccanvas.store.getState().shapes)
  .map((s) => [s.type, s.props.latex ?? s.props.html ?? '']));
const select = (page: Page, s: number, e: number) => page.evaluate(([a, b]) => { const mf = document.querySelector('math-field') as unknown as HTMLElement & { selection: unknown }; mf.focus(); mf.selection = { ranges: [[a, b]] }; }, [s, e]);

test.describe('copying math', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
    await newBlankWorksheet(page, 'page');
    const p = await screenOf(page, 176, 160);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('x:', { delay: 30 });
    await page.evaluate(() => { (document.querySelector('math-field') as unknown as { value: string }).value = 'x\\coloneq f_{c.k}\\cdot\\alpha_{cr}+\\gamma_{M0}+\\pi'; });
  });

  test('a name with a subscript is copied whole and pastes as math into another math region', async ({ page }) => {
    await select(page, 8, 9); // the base f alone
    await page.keyboard.press('Control+c');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('$$ f_{c.k} $$');
    await select(page, 17, 18); // the c inside α_cr
    await page.keyboard.press('Control+c');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('$$ \\alpha_{cr} $$');
    // Escape with a selection keeps the whole expression (MathLive's LaTeX mode would take the selection out)
    await page.keyboard.press('Escape');
    await expect.poll(() => shapes(page)).toEqual([['math', 'x\\coloneq f_{c.k}\\cdot\\alpha_{cr}+\\gamma_{M0}+\\pi']]);
    const p = await screenOf(page, 176, 260);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.type('y:', { delay: 30 });
    await page.keyboard.press('Control+v');
    await page.keyboard.type('*2', { delay: 30 });
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await shapes(page))[1]?.[1]).toBe('y\\coloneq\\alpha_{cr}\\cdot2');
  });

  test('copied math pastes on the worksheet as a math region and into text as readable text', async ({ page }) => {
    await select(page, 21, 26); // γ_M0
    await page.keyboard.press('Control+c');
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 5);
    const p = await screenOf(page, 176, 260);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press('Control+v');
    await expect.poll(() => shapes(page)).toContainEqual(['math', '\\gamma_{M0}']);
    // into a text region: γ with the subscript M0, not "$$ \gamma_{M0} $$"
    const q = await screenOf(page, 176, 340);
    await page.mouse.click(q.x, q.y);
    await page.keyboard.type('"Factor ', { delay: 30 });
    await page.keyboard.press('Control+v');
    await page.keyboard.press('Escape');
    await expect.poll(async () => (await shapes(page)).find(([t]) => t === 'text')?.[1] ?? '').toContain('γ<sub>M0</sub>');
    await expect.poll(async () => (await shapes(page)).find(([t]) => t === 'text')?.[1] ?? '').not.toContain('\\gamma');
  });
});
