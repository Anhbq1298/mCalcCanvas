import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TPL = path.resolve(HERE, '../../templates');
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await page.goto(`${process.env.APP_URL ?? 'http://localhost:4173'}/?template=blank`);
await page.waitForFunction(() => !!window.__calccanvas);
await page.evaluate(() => window.__calccanvas.loaded);
const d = fs.readFileSync(path.join(TPL, '' + process.argv[2] + '.mCCV'));
const gen = Object.fromEntries(JSON.parse(d).shapes.map(s => [s.id, s.y]));
await page.getByRole('menuitem', { name: 'File' }).click();
const chooser = page.waitForEvent('filechooser');
await page.getByRole('menuitem', { name: /^Open…/ }).click(); await page.getByTestId('open-file').click();
await (await chooser).setFiles({ name: 'x.mCCV', mimeType: '', buffer: d });
await page.waitForFunction(ids => ids.every(id => !!window.__calccanvas.store.getState().shapes[id]), Object.keys(gen));
// Wait for every result (result widths depend on them), then let the layout settle.
await page.waitForFunction(() => { const r = [...document.querySelectorAll('[data-testid=math-region]')]; return r.length > 0 && r.every((e) => ['valid', 'error'].includes(e.getAttribute('data-status') ?? '')); }, null, { timeout: 120000 });
// Visit each vertical strip so lazy-rendered value-only cells are measured as results,
// not as the temporary definition shown before their first calculation.
const { camera, strips } = await page.evaluate(() => {
  const st = window.__calccanvas.store.getState();
  return { camera: st.camera, strips: [...new Set(Object.values(st.shapes).filter(s => s.type === 'math').map(s => Math.floor(s.y / 400)))] };
});
for (const index of strips) {
  await page.evaluate(({ index }) => window.__calccanvas.store.setState({ camera: { x: 0, y: index * 400 - 24, z: 1 } }), { index });
  await page.waitForFunction(index => [...document.querySelectorAll('[data-testid=math-region]')].filter(el => Math.floor(window.__calccanvas.store.getState().shapes[el.getAttribute('data-shape-id')].y / 400) === index).every(el => el.querySelector('.math-baseline > span')?.childNodes.length), index);
  // Let React's measurement effect and ResizeObserver finish before moving away.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
await page.evaluate(camera => window.__calccanvas.store.setState({ camera }), camera);
await page.evaluate(() => document.fonts.ready);
// Then until the measured sizes stop changing.
const sizesNow = () => page.evaluate(() => JSON.stringify(Object.values(window.__calccanvas.store.getState().shapes).map((s) => [s.y, s.props.w, s.props.h, s.props.baseline])));
for (let prev = '', cur = await sizesNow(); cur !== prev; ) { await page.evaluate(() => window.__calccanvas.idle()); await page.waitForTimeout(500); prev = cur; cur = await sizesNow(); }
const widths = await page.evaluate(() => Object.fromEntries(Object.values(window.__calccanvas.store.getState().shapes).filter(s => s.type === 'math').map(s => [s.props.latex, [Math.round(s.props.w), Math.round(s.props.h), Math.round(s.props.baseline ?? 20)]])));
fs.writeFileSync(path.join(HERE, process.argv[3]), JSON.stringify(widths));
const shapes = await page.evaluate(() => Object.values(window.__calccanvas.store.getState().shapes).map(s => [s.id, (s.props.latex ?? s.props.html ?? s.props.title ?? s.type).slice(0,30), Math.round(s.x), Math.round(s.y), Math.round(s.props.w), Math.round(s.props.h)]).sort((a,b)=>a[3]-b[3]));
for (const s of shapes) { const g = gen[s[0]]; const pg = Math.floor(g/1171); console.log(pg+1, s[3]-g, JSON.stringify(s.slice(1))); }
await browser.close();
