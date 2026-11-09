// Evaluate the real printed boxes captured by audit.mjs, including every page.
import fs from 'node:fs';
const phase = process.argv[2] ?? 'after';
let failed = false;
for (const id of ['steel-beam', 'rc-beam', 'rc-rectangular-column', 'rc-circular-column']) {
  const report = JSON.parse(fs.readFileSync(`output/templates/${phase}/${id}.json`));
  const boxes = report.boxes.filter(b => ['math', 'text', 'graph', 'table', 'image'].includes(b.type));
  const outside = boxes.filter(b => b.x < 75 || b.y < 59 || b.x + b.w > b.pageW - 75 || b.y + b.h > b.pageH - 59);
  const clipped = boxes.filter(b => b.clippedText);
  const collisions = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.page !== b.page || a.group && a.group === b.group) continue;
    if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1) collisions.push([a.id, b.id]);
  }
  const utilization = Array.from({ length: report.pages }, (_, i) => {
    const page = boxes.filter(b => b.page === i + 1);
    const left = Math.min(...page.map(b => b.x)), right = Math.max(...page.map(b => b.x + b.w));
    const top = Math.min(...page.map(b => b.y)), bottom = Math.max(...page.map(b => b.y + b.h));
    return page.length ? (right - left) * (bottom - top) / ((page[0].pageW - 152) * (page[0].pageH - 120)) : 0;
  });
  const quality = { id, pages: report.pages, utilization, outside, clipped, collisions };
  fs.writeFileSync(`output/templates/${phase}/${id}-quality.json`, JSON.stringify(quality, null, 2));
  console.log(id, 'pages', report.pages, 'outside', outside.length, 'clipped', clipped.length, 'collisions', collisions.length, 'bbox use', (100 * utilization.reduce((a,b)=>a+b,0) / utilization.length).toFixed(1) + '%');
  for (const box of clipped) { const s = report.shapes.find(s => s.id === box.id); console.log('CLIPPED', s.props.html, s.props.w, s.props.h, report.metrics[s.props.html]); }
  failed ||= !!(outside.length || clipped.length || collisions.length);
}
if (failed) process.exitCode = 1;
