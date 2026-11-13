import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-b'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--base=./'], { cwd: root, stdio: 'inherit' });
cpSync(path.join(root, 'dist'), path.join(here, 'app'), { recursive: true });
const fontDir = path.join(here, 'app/fonts');
mkdirSync(fontDir, { recursive: true });
for (const family of ['inter', 'roboto']) {
  cpSync(path.join(here, `node_modules/@fontsource-variable/${family}/files/${family}-latin-wght-normal.woff2`), path.join(fontDir, `${family}.woff2`));
}
const index = path.join(here, 'app/index.html');
const html = readFileSync(index, 'utf8').replace(/<link\b[^>]*https:\/\/fonts\.[^>]*>/g, '');
const fonts = ['Inter', 'Roboto'].map(family => `@font-face{font-family:'${family}';font-style:normal;font-weight:100 900;font-display:swap;src:url('./fonts/${family.toLowerCase()}.woff2') format('woff2')}`).join('');
writeFileSync(index, html.replace('</head>', `<style>${fonts}</style></head>`));
console.log('Desktop renderer prepared in offline/app');
