import { expect, test, type Page } from '@playwright/test';
import { newBlankWorksheet, openFresh, region, resultOf } from './helpers.ts';

const pageCount = (page: Page) => page.locator('[data-testid=page-sheet]').count();

test.describe('Parameters panel', () => {
  test.beforeEach(async ({ page }) => {
    await openFresh(page);
  });

  test('lists definitions in reading order, jumps to a region and edits inputs', async ({ page }) => {
    await page.getByRole('tab', { name: 'Parameters' }).click();
    const panel = page.getByTestId('parameters-panel');
    await expect(panel).toBeVisible();
    const names = await panel.getByTestId('param-row').evaluateAll((els) => els.map((e) => e.getAttribute('data-name')));
    expect(names.slice(0, 5)).toEqual(['L', 'b', 'G', 'Q', 'w']);
    expect(names).toContain('M_Ed');

    // Click a row: that region is selected.
    await panel.locator('[data-testid=param-row][data-name=w]').click();
    const selected = await page.evaluate(() => (window as unknown as { __calccanvas: { store: { getState(): { selection: string[] } } } }).__calccanvas.store.getState().selection);
    const w = await region(page, 'w\\coloneq');
    expect(selected).toEqual([w!.id]);

    // Edit L in the panel: M_Ed follows.
    const before = (await region(page, 'M_{Ed}'))!.result;
    const input = panel.getByTestId('param-input-L');
    await input.fill('10');
    await input.press('Enter');
    await expect.poll(async () => (await region(page, 'L\\coloneq'))?.latex).toBe('L\\coloneq10\\,\\mathrm{m}');
    await expect.poll(async () => (await region(page, 'M_{Ed}'))?.result).not.toBe(before);

    // Search + close / reopen.
    await panel.getByLabel('Search parameters').fill('eta');
    await expect(panel.getByTestId('param-row')).toHaveCount(2);
    await page.getByLabel('Close side panel').click();
    await expect(panel).toHaveCount(0);
    await page.getByTestId('toggle-params').click();
    await expect(page.getByTestId('parameters-panel')).toBeVisible();
  });

  test('insert and delete a blank page', async ({ page }) => {
    await newBlankWorksheet(page, 'page');
    await expect.poll(() => pageCount(page)).toBe(1);
    await page.getByTestId('insert-page').click();
    await expect.poll(() => pageCount(page)).toBe(2);
    await page.keyboard.press('Control+Enter');
    await expect.poll(() => pageCount(page)).toBe(3);
    // The view is on the last inserted page (empty) → it can be deleted.
    await page.getByRole('menuitem', { name: 'Insert' }).click();
    await page.getByRole('menuitem', { name: 'Delete empty page' }).click();
    await expect.poll(() => pageCount(page)).toBe(2);
  });

  test('inserting a page moves later content down one page', async ({ page }) => {
    // Demo: everything is on page 1; select L and insert a page after page 1 — nothing moves.
    await resultOf(page, 'M_{Ed}').not.toBe('');
    const yBefore = await page.evaluate(() => Object.values((window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { y: number }> } } } }).__calccanvas.store.getState().shapes).map((s) => s.y));
    await page.getByTestId('insert-page').click();
    const yAfter = await page.evaluate(() => Object.values((window as unknown as { __calccanvas: { store: { getState(): { shapes: Record<string, { y: number }> } } } }).__calccanvas.store.getState().shapes).map((s) => s.y));
    expect(yAfter).toEqual(yBefore);
    await expect.poll(() => pageCount(page)).toBeGreaterThanOrEqual(2);
  });

  test('help guide shows a live snapshot for each display format and unit topic', async ({ page }) => {
    await page.getByRole('menuitem', { name: 'Help' }).click();
    await page.getByRole('menuitem', { name: 'Display formats & units guide' }).click();
    const dlg = page.getByRole('dialog', { name: 'Display formats & units' });
    await expect(dlg.getByTestId('guide-card')).toHaveCount(6);
    await expect(dlg).toContainText('257.39');
    await dlg.getByRole('tab', { name: 'Units' }).click();
    await expect(dlg).toContainText('kip');
    await expect(dlg.getByTestId('guide-card')).toHaveCount(6);
  });
});

test.describe('.mCalcCanvas files', () => {
  test('save to a .mCalcCanvas file and open it again', async ({ page }) => {
    await page.addInitScript(() => {
      delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
    });
    await openFresh(page);
    const dl = page.waitForEvent('download');
    await page.keyboard.press('Control+Shift+S');
    const download = await dl;
    expect(download.suggestedFilename()).toBe('Simply Supported Steel Beam Calculation.mCalcCanvas');
    const path = await download.path();

    await newBlankWorksheet(page, 'page');
    await page.getByRole('menuitem', { name: 'File' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: /Open file/ }).click();
    await (await chooser).setFiles({ name: 'beam.mCalcCanvas', mimeType: '', buffer: await (await import('node:fs/promises')).readFile(path!) });
    await resultOf(page, 'M_{Ed}').toContain('257.39');
    expect((await region(page, 'L\\coloneq'))?.latex).toBe('L\\coloneq8.5\\,\\mathrm{m}');
  });
});

test.describe('Outline (navigation pane)', () => {
  test('lists headings, navigates, adds and renames sections, paragraph styles', async ({ page }) => {
    await openFresh(page);
    const outline = page.getByTestId('outline-panel');
    await expect(outline).toBeVisible();
    const items = outline.getByTestId('outline-item');
    await expect(items).toHaveCount(6);
    await expect(items.nth(1)).toHaveText('1. DESIGN PARAMETERS');
    await expect(items.nth(0)).toHaveAttribute('data-level', '1');

    // Click a heading: it becomes selected and highlighted.
    await items.nth(3).click();
    const sel = await page.evaluate(() => (window as unknown as { __calccanvas: { store: { getState(): { selection: string[]; shapes: Record<string, { props: { html: string } }> } } } }).__calccanvas.store.getState());
    expect(sel.shapes[sel.selection[0]].props.html).toContain('3. BENDING MOMENT');

    // Add a section, type its title.
    await page.getByTestId('add-heading-1').click();
    await page.keyboard.type('6. DEFLECTION', { delay: 10 });
    await page.keyboard.press('Escape');
    await expect(items).toHaveCount(7);
    await expect(items.last()).toHaveText('6. DEFLECTION');

    // Rename by double-click.
    await items.last().dblclick();
    const input = outline.getByLabel('Heading text');
    await input.fill('6. SERVICEABILITY');
    await input.press('Enter');
    await expect(items.last()).toHaveText('6. SERVICEABILITY');

    // Turn the description text into a Heading 3 with the toolbar style box.
    const desc = page.getByTestId('text-region').filter({ hasText: 'Span, tributary width' });
    await items.nth(1).click(); // scroll back to section 1
    await desc.click();
    await page.getByTestId('paragraph-style').selectOption('3');
    await expect(items).toHaveCount(8);
    await expect(outline.locator('[data-level="3"]')).toHaveCount(1);
    // ...and back to normal text with Ctrl+Alt+0.
    await page.keyboard.press('Control+Alt+0');
    await expect(items).toHaveCount(7);
  });
});

test.describe('Templates', () => {
  test('RC beam template is the default on a first visit', async ({ page }) => {
    await openFresh(page, '');
    await expect(page.getByLabel('Worksheet title')).toHaveValue('RC Beam Bending Design');
  });

  test('returning visitors see the new default template once, then their own work', async ({ page }) => {
    await openFresh(page); // steel sample saved in this profile
    await page.evaluate(() => localStorage.removeItem('calccanvas.defaultTemplate'));
    await page.reload();
    await expect(page.getByLabel('Worksheet title')).toHaveValue('RC Beam Bending Design');
    await page.getByLabel('Worksheet title').fill('My beam');
    await page.keyboard.press('Control+s');
    await page.reload();
    await expect(page.getByLabel('Worksheet title')).toHaveValue('My beam');
  });

  test('RC beam template: two pages, outline, all regions calculate, checks pass', async ({ page }) => {
    await openFresh(page);
    await page.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /RC beam/ }).click();
    await expect(page.getByLabel('Worksheet title')).toHaveValue('RC Beam Bending Design');
    await resultOf(page, 'M_{Ed}\\coloneq').toContain('364.5');
    await expect(page.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
    await expect(page.locator('[data-testid=page-sheet]')).toHaveCount(2);
    await expect(page.getByTestId('outline-item')).toHaveCount(14);
    await expect(page.getByTestId('check-badge').filter({ hasText: 'PASS' })).toHaveCount(3);
  });
});

test.describe('Formatting tabs', () => {
  test('math and text formatting tabs follow the selection and format regions', async ({ page }) => {
    await openFresh(page);
    // Select the L definition → Math formatting tab.
    const L = page.locator('.math-region[data-latex^="L\\\\coloneq"]');
    await L.click();
    await expect(page.getByTestId('format-tab-math')).toHaveAttribute('aria-selected', 'true');
    const unit = page.getByTestId('math-result-unit');
    await unit.fill('furlong');
    await unit.press('Enter');
    await expect(unit).toHaveAttribute('title', /Unknown unit/);
    await unit.fill('mm');
    await unit.press('Enter');
    await expect(L).toHaveAttribute('data-result', '8500 mm');
    // L is an input: the literal itself is rewritten with the same value (8.5 m → 8500 mm).
    await expect(L).toHaveAttribute('data-latex', 'L\\coloneq8500\\,\\mathrm{mm}');
    await resultOf(page, 'M_{Ed}').not.toContain('NaN');
    await page.getByTestId('math-decimals').selectOption('0');
    await page.getByTestId('worksheet-units').selectOption('Imperial');
    await resultOf(page, 'M_{Ed}').toContain('kip');
    await page.getByTestId('worksheet-units').selectOption('SI');
    // Operators gallery: unsupported operators are shown but disabled.
    await page.getByTestId('palette-operators').click();
    await expect(page.getByRole('button', { name: /Summation – Not supported/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Square root  ( \\ )' })).toBeEnabled();
    await page.keyboard.press('Escape');
    // Select a text region → Text formatting tab.
    await page.getByTestId('text-region').filter({ hasText: 'Span, tributary width' }).click();
    await expect(page.getByTestId('format-tab-text')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('paragraph-style')).toBeVisible();
    // Tabs can also be switched by hand.
    await page.getByTestId('format-tab-math').click();
    await expect(page.getByTestId('format-panel-math')).toBeVisible();
  });
});
