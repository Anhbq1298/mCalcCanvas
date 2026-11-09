// .mCCV document icon: a page with the blue Σ badge of the app logo (DocsHeader).
// Writes public/icons/mccv-file.svg (large), mccv-file-small.svg (16–32 px, simplified),
// PNGs and a Windows .ico (PNG-compressed entries 16…256). Usage: node tools/icons/build-file-icon.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/icons');
const BLUE = '#0b57d0'; // --color-docs-blue
const FOLD = '#d3e3fd';
const EDGE = '#8a9ab0';
const LINE = '#c5d0df';
/** lucide "sigma" (24-unit box), the glyph of the app logo. */
const SIGMA = 'M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2';

const large = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <title>mCalcCanvas worksheet (.mCCV)</title>
  <defs>
    <linearGradient id="page" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef3fa"/></linearGradient>
    <linearGradient id="badge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a66de"/><stop offset="1" stop-color="${BLUE}"/></linearGradient>
  </defs>
  <path d="M68 12h92l56 56v168a8 8 0 0 1-8 8H68a8 8 0 0 1-8-8V20a8 8 0 0 1 8-8z" fill="url(#page)" stroke="${EDGE}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M160 12v44a12 12 0 0 0 12 12h44" fill="${FOLD}" stroke="${EDGE}" stroke-width="4" stroke-linejoin="round"/>
  <g fill="${LINE}">
    <rect x="84" y="40" width="60" height="8" rx="4"/><rect x="84" y="58" width="44" height="8" rx="4"/>
    <rect x="172" y="116" width="28" height="8" rx="4"/><rect x="172" y="140" width="28" height="8" rx="4"/>
    <rect x="172" y="164" width="28" height="8" rx="4"/><rect x="172" y="188" width="20" height="8" rx="4"/>
  </g>
  <rect x="20" y="88" width="140" height="140" rx="26" fill="url(#badge)"/>
  <path d="${SIGMA}" transform="translate(30 98) scale(5)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

const small = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <title>mCalcCanvas worksheet (.mCCV)</title>
  <path d="M8.5 1.5h11l6 6v21a1.5 1.5 0 0 1-1.5 1.5H8.5A1.5 1.5 0 0 1 7 28.5v-25A1.5 1.5 0 0 1 8.5 1.5z" fill="#ffffff" stroke="${EDGE}" stroke-linejoin="round"/>
  <path d="M19.5 1.5V6.5a1 1 0 0 0 1 1h5" fill="${FOLD}" stroke="${EDGE}" stroke-linejoin="round"/>
  <rect x="1.5" y="11" width="19" height="19" rx="3.5" fill="${BLUE}"/>
  <path d="${SIGMA}" transform="translate(2.6 11.1) scale(0.79)" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'mccv-file.svg'), large);
fs.writeFileSync(path.join(OUT, 'mccv-file-small.svg'), small);

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const PNG_FILES = [16, 32, 48, 256, 512];
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage();
const png = {};
for (const size of [...new Set([...ICO_SIZES, ...PNG_FILES])].sort((a, b) => a - b)) {
  const svg = size <= 32 ? small : large;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`,
  );
  await page.locator('img').evaluate((img) => img.decode());
  png[size] = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
for (const size of PNG_FILES) fs.writeFileSync(path.join(OUT, `mccv-file-${size}.png`), png[size]);

// ICO: ICONDIR + one ICONDIRENTRY per size, PNG data after (Windows Vista+).
const header = Buffer.alloc(6 + 16 * ICO_SIZES.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(ICO_SIZES.length, 4);
let offset = header.length;
ICO_SIZES.forEach((size, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(size >= 256 ? 0 : size, e);
  header.writeUInt8(size >= 256 ? 0 : size, e + 1);
  header.writeUInt8(0, e + 2);
  header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(png[size].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += png[size].length;
});
fs.writeFileSync(path.join(OUT, 'mccv-file.ico'), Buffer.concat([header, ...ICO_SIZES.map((s) => png[s])]));
console.log('wrote', fs.readdirSync(OUT).join(', '));
