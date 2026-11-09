import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TPL = path.resolve(HERE, '../../templates');
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--no-sandbox'] });
for (const f of process.argv.slice(2)) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto(`${process.env.APP_URL ?? 'http://localhost:4173'}/?template=blank`);
  await page.waitForFunction(() => !!window.__calccanvas);
  await page.evaluate(() => { window.print = () => {}; });
  await page.getByRole('menuitem', { name: 'File' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem', { name: /^Open…/ }).click(); await page.getByTestId('open-file').click();
  await (await chooser).setFiles({ name: 'x.mCCV', mimeType: '', buffer: fs.readFileSync(path.join(TPL, `${f}.mCCV`)) });
  await page.waitForTimeout(6000);
  await page.getByTestId('export-pdf').click();
  await page.waitForTimeout(3000);
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: path.join(process.env.PDF_DIR ?? HERE, `${f}.pdf`), preferCSSPageSize: true, printBackground: true });
  console.log('ok', f);
  await page.close();
}
await browser.close();
