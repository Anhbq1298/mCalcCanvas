import { readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8'));
const releaseDir = path.join(here, 'release');
const current = `mCalcCanvas-${version}-win-x64.exe`;
// Never remove the previous working release when packaging failed or produced no EXE.
if (!statSync(path.join(releaseDir, current)).isFile() || statSync(path.join(releaseDir, current)).size === 0) {
  throw new Error(`Current executable is missing or empty: ${current}`);
}
for (const entry of readdirSync(releaseDir, { withFileTypes: true })) {
  if (!entry.isFile() || entry.name === current || !/^mCalcCanvas-\d+\.\d+\.\d+(?:-[\w.-]+)?-win-x64\.exe$/.test(entry.name)) continue;
  const target = path.resolve(releaseDir, entry.name);
  if (path.dirname(target) !== releaseDir) throw new Error('Release cleanup escaped its output directory.');
  unlinkSync(target);
  console.log(`Removed old desktop build: ${entry.name}`);
}
