// Regenerates the generated templates (RC columns, steel beam-column): generate → measure region sizes in the built app → generate again.
// Needs a production build (npm run build). Usage: node tools/templates/build.mjs [--pdf] [--only=rect|col|steel]
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const node = (f, ...args) => execFileSync(process.execPath, [path.join(HERE, f), ...args], { stdio: ['ignore', 'pipe', 'inherit'], cwd: ROOT }).toString();
const server = process.env.APP_URL ? null : spawn(process.execPath, [path.resolve(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
try {
  await new Promise((r) => setTimeout(r, 4000));
  const only = process.argv.find((x) => x.startsWith('--only='))?.slice(7);
  for (const k of ['rect', 'col', 'steel'].filter((x) => !only || x === only)) {
    const measure = () => (k === 'steel' ? node('measure.mjs', 'Steel_Beam_Column_EC3', 'sizes_steel.json') : node(`measure_${k}.mjs`));
    for (let i = 0; i < 2; i++) { node(`gen_${k}.mjs`); measure(); }
    process.stdout.write(node(`gen_${k}.mjs`));
    // Regions the app had to move (overlap or snapping): should be empty.
    const moved = measure().split('\n').filter((l) => l.trim() && Number(l.split(' ')[1]) !== 0);
    if (moved.length) console.warn(`${k}: ${moved.length} regions moved by the app, e.g.\n${moved.slice(0, 3).join('\n')}`);
  }
  if (process.argv.includes('--pdf')) process.stdout.write(node('pdf.mjs', ...['RC_Rectangular_Column_Check', 'RC_Circular_Column_Check', 'Steel_Beam_Column_EC3'].filter((f) => !only || f.toLowerCase().includes(only === 'col' ? 'circular' : only === 'rect' ? 'rectangular' : only))));
} finally {
  server?.kill();
}
