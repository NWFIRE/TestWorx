const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

async function main() {
  const css = await postcss([tailwind({content:["apps/web/src/app/app/admin/billing/billing-queue-filters.tsx", "apps/web/src/app/search-input.tsx"]})]).process("@tailwind base; @tailwind utilities;",{from:undefined});
  const bundle = await build({stdin:{contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {BillingQueueFilters} from './apps/web/src/app/app/admin/billing/billing-queue-filters';
    const root=createRoot(document.getElementById('app')); window.calls=[];
    window.renderUrl=(url)=>{const p=new URL(url,location.origin).searchParams;root.render(<BillingQueueFilters status={p.get('status')||'all'} sort={p.get('sort')||'newest'} query={p.get('q')||''}/>)};
    window.navigate=(url,options)=>{window.calls.push({url,options});history.replaceState(null,'',url)};
    window.renderUrl(location.href);
  `,loader:"tsx",resolveDir:path.resolve(__dirname,"..")},bundle:true,write:false,jsx:"automatic",
    tsconfig:"apps/web/tsconfig.json",define:{"process.env.NODE_ENV":'"development"'},plugins:[{name:"router",setup(b){
      b.onResolve({filter:/^next\/navigation$/},()=>({path:"router",namespace:"mock"}));
      b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:"export const useRouter=()=>({replace:window.navigate});"}));
    }}]});
  const browser=await chromium.launch();
  try {
    for(const width of [390,900,1440]) {
      const page=await browser.newPage({viewport:{width,height:850}});const errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      await page.route("http://localhost/**",r=>r.fulfill({contentType:"text/html",body:'<div id="app" style="padding:16px"></div>'}));
      await page.goto("http://localhost/app/admin/billing");
      await page.addStyleTag({content:css.css});await page.addScriptTag({content:bundle.outputFiles[0].text});
      const input=page.getByRole("searchbox");const sort=page.getByLabel("Sort by");
      await input.focus();await page.waitForTimeout(1300);
      assert.equal(await page.evaluate(()=>window.calls.length),0,"Focus must not search");
      await input.fill("INV-00123");await page.waitForTimeout(350);
      assert.equal(await page.evaluate(()=>window.calls.length),0,"Short pauses must not search");
      await page.getByRole("button",{name:"Invoiced",exact:true}).click();
      await sort.selectOption("oldest");
      assert.deepEqual(await page.evaluate(()=>Object.fromEntries(new URLSearchParams(location.search))),{status:"invoiced",sort:"oldest",q:"INV-00123"});
      await input.fill("INV-001234");
      await page.evaluate(()=>window.renderUrl(window.calls[0].url));
      assert.equal(await input.inputValue(),"INV-001234","Stale response must not replace new text");
      assert.equal(await sort.inputValue(),"oldest","Stale response must not reset sort");
      await input.focus();await page.waitForTimeout(1400);
      assert.equal(await page.evaluate(()=>new URLSearchParams(location.search).get("q")),"INV-001234");
      assert.equal(await input.evaluate(el=>el===document.activeElement),true);
      await page.getByRole("button",{name:"Clear search",exact:true}).click();
      assert.deepEqual(await page.evaluate(()=>Object.fromEntries(new URLSearchParams(location.search))),{status:"invoiced",sort:"oldest"});
      await page.getByRole("button",{name:"Clear filters",exact:true}).click();
      assert.equal(new URL(page.url()).search,"");assert.equal(await sort.inputValue(),"newest");
      await page.evaluate(()=>{history.pushState(null,'','?status=billing_review&sort=alphabetical&q=Alpha');dispatchEvent(new PopStateEvent('popstate'));window.renderUrl(location.href)});
      await page.waitForFunction(()=>document.querySelector('input').value==='Alpha');
      assert.equal(await sort.inputValue(),"alphabetical");
      assert.equal(await page.getByRole("button",{name:"Needs billing review",exact:true}).getAttribute("aria-pressed"),"true");
      assert.ok(await page.evaluate(()=>window.calls.every(c=>c.options.scroll===false)));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);await page.close();
    }
    console.log("PASS: focus, debounce, invoice query, combined rapid changes, stale responses, clear/reset, URL/history restore, focus/scroll preservation and mobile sizing. Router responses mocked; real filter controls executed.");
  } finally {await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
