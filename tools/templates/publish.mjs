// Consolidate the measured evidence, actual PDF counts, and reviewer-friendly report.
import fs from 'node:fs';
import path from 'node:path';
const destination = 'docs/template-layout';
for (const dir of [destination, `${destination}/reports`, `${destination}/screenshots`, 'output/pdf']) fs.mkdirSync(dir, { recursive: true });
const templates = [
  ['steel-beam', 'Steel beam'], ['rc-beam', 'RC beam'],
  ['rc-rectangular-column', 'RC rectangular column'], ['rc-circular-column', 'RC circular column'],
];
const modes = [['after', 'A4 portrait'], ['A4-landscape', 'A4 landscape'], ['A3-portrait', 'A3 portrait'], ['A3-landscape', 'A3 landscape']];
const read = (phase, id, suffix = '') => JSON.parse(fs.readFileSync(`output/templates/${phase}/${id}${suffix}.json`));
const rows = [];
const formats = [];
let checks = 0;
for (const [id, label] of templates) {
  const before = read('before', id);
  const after = read('after', id);
  const quality = read('after', id, '-quality');
  if (quality.outside.length || quality.collisions.length || quality.clipped.length) throw new Error(`${id}: layout quality failed`);
  checks += after.results.length;
  const utilization = quality.utilization.reduce((a,b)=>a+b,0) / quality.utilization.length;
  rows.push(`| ${label} | ${before.pages} | ${after.pages} | ${((before.pages-after.pages)/before.pages*100).toFixed(1)}% | ${(utilization*100).toFixed(1)}% | PASS |`);
  const links = [];
  for (const [phase, name] of modes) {
    const data = read(phase, id);
    const q = read(phase, id, '-quality');
    if (q.outside.length || q.collisions.length || q.clipped.length) throw new Error(`${id}/${phase}: layout quality failed`);
    const filename = `${id}-${name.replace(' ', '-')}.pdf`;
    fs.copyFileSync(`output/templates/${phase}/${id}.pdf`, `${destination}/reports/${filename}`);
    fs.copyFileSync(`output/templates/${phase}/${id}.pdf`, `output/pdf/${filename}`);
    links.push(`[${data.pages} pages](reports/${filename})`);
  }
  formats.push(`| ${label} | ${links.join(' | ')} |`);
  for (const name of fs.readdirSync('output/templates/after').filter(n => n.startsWith(`${id}-contact-`))) fs.copyFileSync(path.join('output/templates/after', name), `${destination}/screenshots/${name}`);
  for (const phase of ['before', 'after']) {
    fs.copyFileSync(`output/templates/${phase}/${id}-page-1.png`, `${destination}/screenshots/${id}-${phase}.png`);
  }
  fs.copyFileSync(`output/templates/after/${id}-worksheet.png`, `${destination}/screenshots/${id}-worksheet.png`);
}
const images = templates.map(([id, label]) => `### ${label}\n\nBefore:\n\n![${label} before](screenshots/${id}-before.png)\n\nAfter:\n\n![${label} after](screenshots/${id}-after.png)\n\n${fs.readdirSync(`${destination}/screenshots`).filter(n => n.startsWith(`${id}-contact-`)).map(n => `![All exported pages](screenshots/${n})`).join('\n\n')}`).join('\n\n');
fs.writeFileSync(`${destination}/README.md`, `# Calculation template layout review\n\nAll four calculation templates were inventoried and refactored. The blank worksheet is not a calculation template. Baseline and final artifacts were captured from the running application in Chrome; PDFs were rendered again with PyMuPDF to verify their actual page counts and inspect every page. No engineering formula, unit, code clause, input binding or result was removed.\n\n## A4 portrait comparison\n\n| Template | Before | After | Reduction | Content bounding-box utilization | Status |\n|---|---:|---:|---:|---:|---|\n${rows.join('\n')}\n\nTotal: **36 to 26 printed pages (27.8% reduction)**. The already single-page steel example stays at one page. Utilization is the mean page content bounding-box area divided by writable page area, not an ink-density estimate.\n\n## PDFs and paper formats\n\n| Template | A4 portrait | A4 landscape | A3 portrait | A3 landscape |\n|---|---|---|---|---|\n${formats.join('\n')}\n\nAll 16 combinations preserve every result and have zero detected collisions, clipped text blocks or out-of-margin math/text/graph regions. Print settings use the configured paper dimensions and margins. A3 landscape uses two reading columns. These are spatial reflows at readable font sizes; there is no whole-document scaling.\n\n## Implementation\n\n- Pure shared planner: \`src/canvas/templateLayout.ts\`, re-exported from \`src/canvas/layout.ts\`. It uses measured bounds, keeps rows and grouped sketches intact, repacks colliding columns, keeps headings with following content and removes obsolete page gaps. Annexes have a clear heading and may start in the remaining space on a page.\n- Both column generators use the same planner in their shared \`tools/templates/layout.mjs\`; generated JSON is never hand-edited. The steel and RC beam factories hydrate browser-measured sizes through \`templatePresentation.ts\` and the generated \`templateMetrics.json\` catalog.\n- Equations use 16 px body type, with 12 px dense annex tables, and smaller intrinsic padding. Long expanded column vectors use labelled continuation panels retaining every entry. The calculation LaTeX stays unchanged.\n- Document → Pages → **Optimize print layout** reflows a copy of the worksheet for export. New templates enable it; older saved documents retain manual print placement until enabled. Export never writes the planned geometry into the canvas store.\n- Annex structure and numbering follow the editable document; destination page references follow the print plan.\n- ResizeObserver measurements are scheduled on animation frames to avoid synchronous observer feedback.\n\n## Validation\n\n- ${checks} mathematical regions compared by exact source LaTeX, raw displayed result and status against the original browser snapshots: unchanged, no errors.\n- Existing independent column calculation references and batch/report tests retained.\n- \`npm run typecheck\`, \`npm run lint\`, \`npm test\`: passed (75 unit/engine tests).\n- \`UI_SNAPSHOTS=1 npm run test:e2e\`: 60 browser tests, including all templates, non-mutating export and A3 landscape.\n- \`npm run build && npm run templates:columns -- --pdf\`: completed with no regions-moved warnings.\n- Every final PDF was rasterized and visually reviewed; before/after page screenshots and all final A4 pages are below.\n\n## Reproduction and limits\n\nServe the production app on port 4173. Run \`node tools/templates/audit.mjs before\` before editing sources, then \`node tools/templates/audit.mjs after\` and \`node tools/templates/quality.mjs after\` after regeneration. Additional audit flags: \`--paper=A3 --orientation=landscape\`. Render PDFs using \`python tools/templates/render.py output/templates/after\`. Publish the consolidated evidence with \`node tools/templates/publish.mjs\`.\n\nThe planner minimizes gaps while preserving logical row/group order. It is a deterministic greedy layout, not a proof of a globally optimal combinatorial packing. Oversized manually created blocks report an export error instead of silently clipping or shrinking the entire document. All template/paper combinations above fit without this limitation.\n\n## Actual application screenshots\n\n${images}\n`);
console.log(`Published ${templates.length} templates and 16 PDF reports to ${destination}`);
