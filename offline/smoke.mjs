import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { _electron as electron, chromium, expect } from '@playwright/test';
import { addRegion, newBlankWorksheet, region, resultOf } from '../src/tests/integration/helpers.ts';

const require = createRequire(import.meta.url);
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.MCCV_DESKTOP_TEST_DATA = mkdtempSync(path.join(tmpdir(), 'mccv-desktop-smoke-'));
const executablePath = process.env.MCCV_DESKTOP_EXECUTABLE || require('electron');
const args = process.env.MCCV_DESKTOP_EXECUTABLE ? [] : [fileURLToPath(new URL('main.cjs', import.meta.url))];
let desktop;
let browser;
let portable;
try {
  let page;
  if (process.env.MCCV_DESKTOP_EXECUTABLE) {
    // Portable launchers do not forward Electron's inspector stdout to Playwright.
    const server = createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    portable = spawn(executablePath, [`--remote-debugging-port=${port}`], { env, windowsHide: true, stdio: 'ignore' });
    for (let attempt = 0; attempt < 60; attempt++) {
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); break; }
      catch { await setTimeout(500); }
    }
    assert.ok(browser, 'Packaged desktop must expose its local test debugging port');
    page = browser.contexts()[0].pages()[0] || await browser.contexts()[0].waitForEvent('page');
  } else {
    desktop = await electron.launch({ executablePath, args, env });
    page = await desktop.firstWindow();
  }
  page.on('pageerror', error => console.error(error.message));
  page.on('requestfailed', request => console.error('Failed resource:', request.url(), request.failure()?.errorText));
  await page.waitForLoadState();
  if (process.env.MCCV_DESKTOP_SCREENSHOT) await page.screenshot({ path: process.env.MCCV_DESKTOP_SCREENSHOT });
  await page.waitForFunction(() => !!window.__calccanvas, null, { timeout: 15000 });
  await page.evaluate(async () => { await window.__calccanvas.loaded; await window.__calccanvas.idle(); });
  assert.equal(new URL(page.url()).protocol, 'mccv:');
  assert.ok(await page.getByTestId('math-region').count() > 0);
  const firstId = await page.getByTestId('math-region').first().getAttribute('data-shape-id');
  assert.equal(await page.locator('[data-testid=math-region][data-status=error]').count(), 0);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const fonts = await page.evaluate(async () => Promise.all(['Inter', 'Roboto'].map(async family => (await document.fonts.load(`16px ${family}`)).length)));
  assert.ok(fonts.every(count => count > 0), 'Inter and Roboto must load from the offline bundle');
  assert.equal(await page.locator('link[href^="https://fonts."]').count(), 0);
  await expect(page.getByTestId('save-state')).toHaveText('Saved');
  if (process.env.MCCV_DESKTOP_SCREENSHOT) await page.screenshot({ path: process.env.MCCV_DESKTOP_SCREENSHOT });
  await page.reload();
  await page.waitForFunction(() => !!window.__calccanvas, null, { timeout: 15000 });
  await page.evaluate(async () => { await window.__calccanvas.loaded; await window.__calccanvas.idle(); });
  assert.ok(await page.getByTestId('math-region').count() > 0);
  assert.equal(await page.getByTestId('math-region').first().getAttribute('data-shape-id'), firstId);
  await newBlankWorksheet(page);
  await addRegion(page, 500, 260, ['L:469mm']);
  const input = await region(page, 'L');
  await addRegion(page, 500, 400, ['z:L=']);
  await resultOf(page, 'z').toBe('0.469 m');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    await window.__calccanvas.idle();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const z = await region(page, 'z');
  const resultBlock = page.locator(`[data-testid=math-region][data-shape-id="${z.id}"]`);
  const bounds = await resultBlock.boundingBox();
  await resultBlock.locator('[data-result-unit]').click();
  await expect(page.getByTestId('math-input')).toHaveCount(0);
  assert.deepEqual(await resultBlock.boundingBox(), bounds);
  const unit = page.getByTestId('inline-result-unit');
  await unit.click();
  await unit.press('Control+a');
  await page.keyboard.type('cm');
  await page.mouse.click(900, 600);
  await resultOf(page, 'z').toBe('46.9 cm');
  assert.equal((await region(page, 'L')).latex, input.latex);
  await newBlankWorksheet(page);
  await addRegion(page, 500, 220, ['fyk:500MPa']);
  await addRegion(page, 500, 320, ['fx:10MPa/mm']);
  await addRegion(page, 500, 420, ['L:fyk/fx=']);
  const length = await region(page, 'L');
  const formula = page.locator(`[data-testid=math-region][data-shape-id="${length.id}"]`);
  await formula.locator('[data-result-unit]').click();
  await unit.press('Control+a');
  await page.keyboard.type('mm');
  await page.mouse.click(900, 600);
  await resultOf(page, 'L').toBe('50 mm');
  await formula.locator('[data-result-unit]').click();
  await expect(unit).toHaveJSProperty('value', '\\unit{mm}');
  await expect.poll(() => unit.evaluate(el => el.selectionIsCollapsed)).toBe(true);
  await unit.press('Control+a');
  await page.keyboard.type('cm');
  await page.mouse.click(900, 600);
  await resultOf(page, 'L').toBe('5 cm');
  assert.equal((await region(page, 'L')).latex, length.latex);
  await formula.locator('[data-result-unit]').click();
  await unit.press('Home');
  await page.keyboard.type('10*');
  await unit.press('End');
  await page.keyboard.type('*m/m');
  await unit.press('Enter');
  await resultOf(page, 'L').toBe('0.5 (10·cm·m/m)');
  assert.equal((await region(page, 'L')).latex, length.latex);
  console.log('Desktop smoke passed: local protocol, worker calculation, sandbox, persistence, editable result units.');
} finally {
  // The isolated smoke profile has no user work; do not wait on unload prompts.
  if (desktop) {
    await desktop.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await desktop.close();
  }
  if (browser) await browser.close();
  if (portable?.pid) {
    try { execFileSync('taskkill', ['/PID', String(portable.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* Already exited. */ }
  }
}
