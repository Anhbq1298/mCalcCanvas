// Real-browser template inventory, rendered metrics, PDFs and calculation snapshots.
// Run against `npm run dev -- --port 4173`: node tools/templates/audit.mjs before|after.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const phase = process.argv[2] ?? 'after';
const source = process.argv.find(arg => arg.startsWith('--source='))?.slice(9);
const paper = process.argv.find(arg => arg.startsWith('--paper='))?.slice(8);
const orientation = process.argv.find(arg => arg.startsWith('--orientation='))?.slice(14);
const root = path.resolve('output/templates', phase);
fs.mkdirSync(root, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
const templates = ['steel-beam', 'rc-beam', 'rc-rectangular-column', 'rc-circular-column'];
const reports = [];
try {
  for (const id of templates) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => { window.print = () => {}; });
    await page.goto(`${process.env.APP_URL ?? 'http://localhost:4173'}/?template=${id}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.__calccanvas);
    await page.evaluate(() => window.__calccanvas.loaded);
    if (source) {
      const original = JSON.parse(fs.readFileSync(`output/templates/${source}/${id}.json`));
      const doc = { format: 'calccanvas', version: 3, id, title: id, metadata: {}, settings: { unitSystem: 'SI', precision: 2, canvasMode: 'page', pageOrientation: 'portrait', showHeaderFooter: true, textFont: 'Inter', pages: original.pages, snapToGrid: false }, shapes: original.shapes };
      await page.getByRole('menuitem', { name: 'File' }).click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('menuitem', { name: /Open file/ }).click();
      await (await chooser).setFiles({ name: 'original.mCalcCanvas', mimeType: '', buffer: Buffer.from(JSON.stringify(doc)) });
    }
    await page.evaluate(() => window.__calccanvas.idle());
    if (paper || orientation) {
      await page.getByTestId('format-tab-document').click();
      await page.getByTestId('doc-paper').selectOption(paper ?? 'A4');
      await page.getByTestId(orientation === 'landscape' ? 'doc-landscape' : 'doc-portrait').click();
      await page.getByTestId('doc-optimize-print').check();
    }
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid=math-region]')].every(e => ['valid', 'error'].includes(e.dataset.status)), null, { timeout: 120000 });
    await page.evaluate(() => document.fonts.ready);
    await page.getByTestId('export-pdf').click();
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(() => {
      const shapes = Object.values(window.__calccanvas.store.getState().shapes);
      const metrics = {};
      const boxes = [];
      for (const el of document.querySelectorAll('#print-root .cc-shape')) {
        const shape = shapes.find(s => s.id === el.dataset.shapeId);
        const body = el.firstElementChild;
        const r = body.getBoundingClientRect();
        const sheet = el.closest('.print-page');
        const p = sheet.getBoundingClientRect();
        boxes.push({ id: shape.id, type: shape.type, group: shape.groupId, page: Number(sheet.dataset.page), x: r.x - p.x, y: r.y - p.y, w: r.width, h: r.height, pageW: p.width, pageH: p.height, clippedText: shape.type === 'text' && body.scrollHeight > body.clientHeight + 1 });
        if (shape.type === 'math') {
          const r = body.getBoundingClientRect();
          const probe = body.querySelector('.baseline-probe').getBoundingClientRect();
          metrics[shape.props.latex] = [Math.ceil(r.width), Math.ceil(r.height), Math.round(probe.bottom - r.top)];
        } else if (shape.type === 'text') {
          const clone = body.cloneNode(true);
          clone.style.height = 'auto';
          clone.style.overflow = 'visible';
          body.parentElement.append(clone);
          const naturalHeight = Math.ceil(clone.getBoundingClientRect().height);
          clone.style.width = 'max-content';
          const previous = metrics[shape.props.html];
          metrics[shape.props.html] = [shape.props.w, Math.max(naturalHeight, previous?.[1] ?? 0), Math.round(shape.props.fontSize * 1.09), Math.max(Math.ceil(clone.getBoundingClientRect().width), previous?.[3] ?? 0)];
          clone.remove();
        }
      }
      return {
        shapes, metrics, boxes, pages: document.querySelectorAll('#print-root .print-page').length,
        results: [...document.querySelectorAll('#print-root [data-testid=math-region]')].map(e => ({ latex: e.dataset.latex, result: e.dataset.result, error: e.dataset.error, status: e.dataset.status })),
      };
    });
    for (let i = 0; i < report.pages; i++) {
      await page.locator('#print-root .print-page').nth(i).screenshot({ path: path.join(root, `${id}-page-${i + 1}.png`) });
    }
    await page.pdf({ path: path.join(root, `${id}.pdf`), preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    await page.screenshot({ path: path.join(root, `${id}-worksheet.png`) });
    fs.writeFileSync(path.join(root, `${id}.json`), JSON.stringify(report, null, 2));
    if (phase !== 'before' && phase !== 'measure') {
      const before = JSON.parse(fs.readFileSync(`output/templates/before/${id}.json`));
      const key = result => JSON.stringify([result.latex, result.result, result.error, result.status]);
      if (JSON.stringify(before.results.map(key).sort()) !== JSON.stringify(report.results.map(key).sort())) throw new Error(`${id}: calculation regression`);
    }
    reports.push({ id, pages: report.pages, regions: report.shapes.length, errors: report.results.filter(r => r.error).length });
    console.log(JSON.stringify(reports.at(-1)));
    await page.close();
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(reports, null, 2));
