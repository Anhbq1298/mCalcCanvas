// Regenerates the column templates: generate → measure region sizes in the built app → generate again.
// Needs a production build (npm run build). Usage: node tools/templates/build.mjs [--pdf]
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const node = (f, ...args) => execFileSync(process.execPath, [path.join(HERE, f), ...args], { stdio: ['ignore', 'pipe', 'inherit'], cwd: ROOT }).toString();
const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
try {
  await new Promise((r) => setTimeout(r, 4000));
  for (const k of ['rect', 'col']) {
    for (let i = 0; i < 2; i++) { node(`gen_${k}.mjs`); node(`measure_${k}.mjs`); }
    process.stdout.write(node(`gen_${k}.mjs`));
    // Regions the app had to move (overlap or snapping): should be empty.
    const moved = node(`measure_${k}.mjs`).split('\n').filter((l) => { const d = Number(l.split(' ')[1]); return Math.abs(d) > 20; });
    if (moved.length) console.warn(`${k}: ${moved.length} regions moved by the app, e.g.\n${moved.slice(0, 3).join('\n')}`);
  }
  if (process.argv.includes('--pdf')) process.stdout.write(node('pdf.mjs', 'RC_Rectangular_Column_Check', 'RC_Circular_Column_Check'));
} finally {
  server.kill();
}
