import {definition} from '../../engineering/steel/contract.js';
import {expect,test} from '@playwright/test';
import {mkdir,readFile} from 'node:fs/promises';
import {openFresh,region,resultOf,waitReady} from './helpers.js';

/** Real production UI + real worksheet/batch workers. Artifacts are uploaded by existing CI. */
test('EC3 catalogue, editable K, LTB safety, batch, custom section, mCCV and printable annexes',async({page})=>{
 test.setTimeout(150000);
 const out='test-results/ui-snapshots/steel-design';await mkdir(out,{recursive:true});
 await page.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});});
 await openFresh(page,'steel-beam-column');
 const idle=()=>page.evaluate(()=>(window as unknown as {__calccanvas:{idle():Promise<void>}}).__calccanvas.idle());
 await idle();await expect(page.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
 await page.screenshot({path:`${out}/01-worksheet.png`});
 // Preserve the unmodified, validated reference worksheet/report before exercising error states.
 const baselineDownload=page.waitForEvent('download');await page.keyboard.press('Control+Shift+S');
 await(await baselineDownload).saveAs(`${out}/Steel_Beam_Column_EC3.mCCV`);
 await page.getByTestId('export-pdf').click();await expect(page.locator('#print-root .print-page').first()).toBeAttached();
 await page.emulateMedia({media:'print'});
 const baselinePages=page.locator('#print-root .print-page');
 for(let i=0;i<await baselinePages.count();i++)await baselinePages.nth(i).screenshot({path:`${out}/reference-page-${i+1}.png`});
 await page.pdf({path:`${out}/Steel_Beam_Column_EC3.pdf`,preferCSSPageSize:true,printBackground:true});
 await expect(baselinePages).toHaveCount(9);
 for(let i=0;i<7;i++){
   const text=await baselinePages.nth(i).innerText();
   expect(text).not.toMatch(/steelDesign|operatorname|entry\(|stack\(/);
 }
 const ltbDiagrams=page.locator('#print-root svg[aria-label="LTB loading and moment diagram"]');
 await expect(ltbDiagrams).toHaveCount(1);
 await expect(ltbDiagrams.first()).toBeVisible();
 await expect(page.locator('#print-root svg[aria-label="Separate serviceability load case"]')).toBeVisible();

 const tableLayout=await page.locator('#print-root [data-testid=math-region]').evaluateAll(els=>{
   const find=(key:string)=>els.find(e=>e.getAttribute('data-latex')?.startsWith(key))?.getBoundingClientRect();
   return Array.from({length:13},(_,i)=>{
     const prefix=(name:string)=>'\\mathrm{'+name+'}_{'+i+'}\\coloneq';
     const boxes=['r','d','UR','State'].map(n=>find(prefix(n)));
     return boxes.every(Boolean)&&Math.max(...boxes.map(b=>b!.top))-Math.min(...boxes.map(b=>b!.top))<1&&boxes.slice(0,-1).every((b,j)=>b!.right<=boxes[j+1]!.left+1);
   });
 });
 expect(tableLayout).toEqual(Array(13).fill(true));
 await page.emulateMedia({media:'screen'});
 await page.getByTestId('format-tab-document').click();await page.getByTestId('doc-paper').selectOption('A3');await page.getByTestId('doc-landscape').click();
 await page.getByTestId('export-pdf').click();await expect(page.locator('#print-root .print-page').first()).toHaveAttribute('data-paper','A3 landscape');
 await page.emulateMedia({media:'print'});await page.pdf({path:`${out}/Steel_Beam_Column_EC3_A3.pdf`,preferCSSPageSize:true,printBackground:true});
 await page.locator('#print-root .print-page').first().screenshot({path:`${out}/reference-A3-page-1.png`});await page.emulateMedia({media:'screen'});
 await page.getByTestId('doc-paper').selectOption('A4');await page.getByTestId('doc-portrait').click();await page.getByTestId('format-tab-math').click();


 const revealInput=async(name:string)=>{await page.getByTestId('parameters-panel').locator(`[data-testid=param-row][data-name="${name}"]`).click();};
 const initial=(await region(page,definition('NcrY')))!.result;
 await page.getByRole('tab',{name:'Parameters',exact:true}).click();
 await page.getByTestId('param-input-Ky').fill('2');await page.getByTestId('param-input-Ky').press('Enter');await idle();
 await resultOf(page,definition('NcrY')).not.toBe(initial);
 await page.getByTestId('param-input-Ky').fill('1');await page.getByTestId('param-input-Ky').press('Enter');await idle();
 await resultOf(page,definition('NcrY')).toBe(initial);
 await revealInput('Section');await page.getByTestId('browse-steel').click();
 await expect(page.getByRole('dialog',{name:'Steel Section Library'})).toBeVisible();
 await page.getByLabel('Section family',{exact:true}).selectOption('W');await page.getByLabel('Search sections').fill('W14X90');
 await page.getByRole('button',{name:/W14X90/}).click();
 await page.screenshot({path:`${out}/02-section-library.png`});
 await page.getByRole('button',{name:'Select Section',exact:true}).click();await idle();
 await resultOf(page,'\\mathrm{Section}\\coloneq').toBe('2206');
 await page.keyboard.press('Control+z');await idle();await resultOf(page,'\\mathrm{Section}\\coloneq').toBe('1211');
 await page.keyboard.press('Control+Shift+z');await idle();await resultOf(page,'\\mathrm{Section}\\coloneq').toBe('2206');
 await revealInput('Section');await page.getByTestId('browse-steel').click();
 await page.getByLabel('Section family',{exact:true}).selectOption('HEB');await page.getByLabel('Search sections').fill('HEB 320');
 await page.getByRole('button',{name:/HEB 320/}).click();await page.getByRole('button',{name:'Select Section',exact:true}).click();await idle();
 await revealInput('LTBmode');await page.getByTestId('configure-ltb').click();await page.getByRole('button',{name:'Combined loading',exact:true}).click();
 await page.screenshot({path:`${out}/03-ltb-picker.png`});
 await page.getByRole('button',{name:'Apply LTB Configuration'}).click();await idle();
 await expect(page.getByTestId('steel-state').first()).toHaveText('NOT VERIFIED');
 await revealInput('LTBmode');await page.getByTestId('configure-ltb').click();await page.getByLabel('Mcr mode',{exact:true}).selectOption('1');
 await page.getByLabel('Manual C1',{exact:true}).fill('1.127');await page.getByLabel('Manual C2',{exact:true}).fill('0.454');
 await page.getByLabel('Independently verified',{exact:true}).check();await page.getByLabel('LTB source',{exact:true}).fill('NCCI SN003b verified fork-end coefficients');
 await page.getByRole('button',{name:'Apply LTB Configuration'}).click();await idle();
 await resultOf(page,definition('Mcr')).not.toBe('0 kN·m');
 await revealInput('LTBmode');await page.getByTestId('configure-ltb').click();await page.getByLabel('Mcr mode',{exact:true}).selectOption('2');
 await page.getByLabel('External Mcr',{exact:true}).fill('400');await page.getByLabel('LTB source',{exact:true}).fill('Browser test — independently supplied Mcr');
 await page.getByRole('button',{name:'Apply LTB Configuration'}).click();await idle();
 await resultOf(page,definition('Mcr')).toBe('400 kN·m');
 await revealInput('LTBmode');await page.getByTestId('configure-ltb').click();
 await expect(page.getByLabel('Mcr mode',{exact:true})).toHaveValue('2');await expect(page.getByLabel('External Mcr',{exact:true})).toHaveValue('400');
 await page.getByRole('button',{name:'Close steel dialog'}).click();
 // Custom profile is embedded as literal quantities, without a lookup/global storage dependency.
 await revealInput('Section');await page.getByTestId('browse-steel').click();await page.getByRole('button',{name:'User-Defined Section',exact:true}).click();
 await page.getByLabel('Custom section name',{exact:true}).fill('Verified custom H320');
 await page.getByRole('button',{name:'Select Section',exact:true}).click();await idle();
 await expect(page.locator('[data-testid=math-region][data-status=error]')).toHaveCount(0);
 const downloadPromise=page.waitForEvent('download');await page.keyboard.press('Control+Shift+S');const download=await downloadPromise;
 expect(download.suggestedFilename()).toMatch(/\.mCCV$/);await download.saveAs(`${out}/Steel_Beam_Column_EC3_custom.mCCV`);
 const content=await readFile((await download.path())!,'utf8');expect(content).toContain('Verified custom H320');expect(content).toContain('steelFigure');
 await page.keyboard.press('Control+o');const chooserPromise=page.waitForEvent('filechooser');await page.getByTestId('open-file').click();
 await(await chooserPromise).setFiles({name:'Steel_Beam_Column_EC3.mCCV',mimeType:'',buffer:Buffer.from(content)});await expect(page.getByTestId('open-file')).toBeHidden();await waitReady(page);await idle();
 await page.getByRole('tab',{name:'Table In&Out',exact:true}).click();await page.getByTestId('calculate-all-batch').click();
 await expect(page.getByText('Current',{exact:true})).toHaveCount(2,{timeout:45000});
 await expect(page.getByTestId('input-results-table')).toContainText('NOT VERIFIED');
 await page.screenshot({path:`${out}/04-batch.png`});
 await page.getByTestId('print-case').first().click();await expect(page.locator('#print-root [data-testid=report-summary]')).toBeAttached();
 await page.getByRole('tab',{name:'CalcCanvas',exact:true}).click();await page.getByRole('tab',{name:'Outline',exact:true}).click();
 await page.getByTestId('outline-item').filter({hasText:'BUCKLING K'}).click();
 await expect(page.getByRole('img',{name:'Idealized buckling end conditions'}).first()).toBeVisible();
 await page.screenshot({path:`${out}/05-buckling-annex.png`});
 await page.getByTestId('export-pdf').click();await expect(page.locator('#print-root .print-page').first()).toBeAttached();
 await page.emulateMedia({media:'print'});
 const sheets=page.locator('#print-root .print-page');
 for(let i=0;i<await sheets.count();i++)await sheets.nth(i).screenshot({path:`${out}/page-${i+1}.png`});
 await page.pdf({path:`${out}/Steel_Beam_Column_EC3_custom.pdf`,preferCSSPageSize:true,printBackground:true});
 await expect(page.locator('#print-root [data-status=error]')).toHaveCount(0);
 // Every printed math region lies inside its page (no clipping or equations beyond margins).
 const overflow=await sheets.evaluateAll(pages=>pages.flatMap((p,i)=>{const b=p.getBoundingClientRect();return Array.from(p.querySelectorAll('[data-testid=math-region]')).flatMap(e=>{const r=e.getBoundingClientRect();return r.right>b.right+1||r.bottom>b.bottom+1?[{page:i+1,latex:e.getAttribute('data-latex')}]:[];});}));
 expect(overflow).toEqual([]);
});
