const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
async function main() {
  const bundle = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {MonthlyInspectionControls} from './apps/web/src/app/app/admin/inspections/monthly/month-controls';
    const root=createRoot(document.getElementById('app')); window.calls=[]; let version=0;
    window.renderMonth=(month)=>root.render(<><MonthlyInspectionControls month={month} timezone="America/Chicago" rows={[{id:month,values:[month+' customer']}]} /><p id="rows">{month} customer</p></>);
    window.navigate=(url,options)=>{window.calls.push({url,options});history.pushState(null,'',url);const current=++version;setTimeout(()=>{if(current===version)window.renderMonth(new URLSearchParams(location.search).get('month'));},300)};
    addEventListener('popstate',()=>{++version;window.renderMonth(new URLSearchParams(location.search).get('month'))});
    window.renderMonth('2026-09');`, loader: "tsx", resolveDir: path.resolve(__dirname, "..") }, bundle: true, write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{name:"navigation",setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:"navigation",namespace:"mock"}));b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:`export const useRouter=()=>({push:window.navigate}); export const usePathname=()=>location.pathname; export const useSearchParams=()=>new URLSearchParams(location.search);` }));}}] });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ acceptDownloads: true }); const errors=[];
    page.on("pageerror",e=>errors.push(e.message));
    await page.route("http://localhost/**",r=>r.fulfill({contentType:"text/html",body:'<div id="app"></div>'}));
    await page.goto("http://localhost/app/admin/inspections/monthly?month=2026-09");
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const input=page.getByLabel("Month",{exact:true});const downloadButton=page.getByRole("button",{name:"Download CSV"});
    await input.fill("2026-10");
    assert.equal(await downloadButton.isDisabled(),true);
    await page.waitForFunction(()=>document.querySelector('#rows').textContent==='2026-10 customer');
    await page.waitForFunction(()=>!document.querySelector('button').disabled);
    assert.ok(page.url().endsWith("month=2026-10"));
    const promise=page.waitForEvent('download');await downloadButton.click();const file=await promise;
    assert.equal(file.suggestedFilename(),'inspections-2026-10.csv');
    assert.ok((await fs.readFile(await file.path(),'utf8')).includes('2026-10 customer'));
    assert.deepEqual(await page.evaluate(()=>calls[0].options),{scroll:false});
    await page.goBack();await page.waitForFunction(()=>document.querySelector('input').value==='2026-09');
    await input.fill('2026-11');await input.fill('2026-12');
    await page.waitForFunction(()=>document.querySelector('#rows').textContent==='2026-12 customer');
    await input.fill('2027-01');await input.fill('2026-12');
    await page.waitForFunction(()=>!document.querySelector('button').disabled);
    assert.equal(await input.inputValue(),'2026-12');
    await input.fill('');assert.equal(await downloadButton.isDisabled(),true);
    assert.deepEqual(errors,[]);
    console.log('PASS: auto-navigation, loading/export guard, changed CSV rows/filename, back navigation, rapid selections, returning to loaded month, invalid selection, scroll preservation option. Navigation/server responses mocked; actual controls/download executed.');
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
