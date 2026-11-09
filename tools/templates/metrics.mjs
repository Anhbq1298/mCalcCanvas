// Reproducible metric catalog, measured by audit.mjs from the real print components.
import fs from 'node:fs';
const phase = process.argv[2] ?? 'before';
const catalog = {};
for (const id of ['steel-beam', 'rc-beam', 'rc-rectangular-column', 'rc-circular-column']) {
  const report = JSON.parse(fs.readFileSync(`output/templates/${phase}/${id}.json`));
  catalog[id] = report.metrics;
}
fs.writeFileSync('src/documents/templateMetrics.json', JSON.stringify(catalog));
