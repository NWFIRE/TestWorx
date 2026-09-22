const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

async function main() {
  const css = await postcss([tailwind({content:["apps/web/src/app/search-input.tsx"]})]).process("@tailwind base; @tailwind utilities;",{from:undefined});
  const bundle = await build({
    stdin: { contents: `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import { LiveUrlSearchInput } from "./apps/web/src/app/live-url-search-input";
      import { LiveUrlSearchSelect } from "./apps/web/src/app/live-url-search-select";
      import { SearchInput } from "./apps/web/src/app/search-input";
      window.calls=[]; window.submits=0;
      const root=createRoot(document.getElementById("app"));
      function Local() { const [q,setQ]=useState(""); return <form onSubmit={e=>{e.preventDefault();window.submits++}}><SearchInput placeholder="Local search" value={q} onChange={e=>setQ(e.target.value)} onClear={()=>setQ("")}/></form> }
      window.renderSearch=(value="",mode="url")=>root.render(mode==="local"?<Local/>:mode==="legacy"?<LiveUrlSearchSelect initialValue={value} paramKey="q" placeholder="Search records" options={[{value:"a",label:"Alpha"}]}/>:<LiveUrlSearchInput initialValue={value} paramKey="q" placeholder="Search records" resetPageKeys={["page"]}/>);
      window.unmountSearch=()=>root.render(null);
      window.renderSearch();
    `, loader: "tsx", resolveDir: path.resolve(__dirname, "..") },
    bundle: true, write: false, jsx: "automatic", define: {"process.env.NODE_ENV":'"production"'},
    plugins: [{ name: "navigation-test-double", setup(b) {
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "test" }));
      b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: `
        const router={replace:(url,options)=>{window.calls.push({url,options});history.replaceState(null,"",url)}};
        export const useRouter=()=>router;
        export const usePathname=()=>"/search";
        export const useSearchParams=()=>new URLSearchParams(location.search);
      ` }));
    }}]
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors=[]; page.on("pageerror", e=>errors.push(e.message));
    await page.route("http://localhost/**", r=>r.fulfill({contentType:"text/html",body:'<div id="app"></div><button id="other">Other control</button>'}));
    await page.goto("http://localhost/search?status=open&page=4");
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.addStyleTag({content:css.css});
    const input=page.getByRole("searchbox");
    await input.focus(); await page.waitForTimeout(1300);
    assert.equal(await page.evaluate(()=>calls.length),0,"Focus must not search");
    assert.equal(await page.getByRole("listbox").count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Search must fit mobile widths");
    await input.fill("fire"); await page.waitForTimeout(450);
    assert.equal(await page.evaluate(()=>calls.length),0,"Short pauses must not search");
    await input.fill("fire alarm"); await page.waitForTimeout(1250);
    assert.equal(await page.evaluate(()=>calls.length),1);
    assert.equal(await input.evaluate(el=>el===document.activeElement),true);
    assert.match(await page.evaluate(()=>calls[0].url),/status=open/);
    assert.match(await page.evaluate(()=>calls[0].url),/page=1/);
    assert.equal(await page.evaluate(()=>calls[0].options.scroll),false);
    await input.fill("fire alarm north");
    await page.evaluate(()=>renderSearch("fire alarm"));
    assert.equal(await input.inputValue(),"fire alarm north","Older response must not erase current typing");
    await page.evaluate(()=>history.replaceState(null,"","/search?status=completed&page=3&q=fire+alarm"));
    await input.press("Enter");
    assert.match(await page.evaluate(()=>calls.at(-1).url),/status=completed/);
    const count=await page.evaluate(()=>calls.length);
    await page.waitForTimeout(1300);
    assert.equal(await page.evaluate(()=>calls.length),count,"Enter must cancel the debounce");
    await page.getByRole("button",{name:"Clear search"}).click();
    assert.equal(await input.inputValue(),"");
    assert.equal(await input.evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.evaluate(()=>new URL(calls.at(-1).url,location.origin).searchParams.has("q")),false);
    await input.fill("abandoned draft");
    await page.evaluate(()=>{history.replaceState(null,"","/search?q=restored&status=open");window.dispatchEvent(new PopStateEvent("popstate"))});
    assert.equal(await input.inputValue(),"restored");
    const historyCount=await page.evaluate(()=>calls.length);
    await page.waitForTimeout(1300);
    assert.equal(await page.evaluate(()=>calls.length),historyCount,"Back cancels pending drafts");
    await input.dispatchEvent("compositionstart"); await input.fill("composition");
    await page.waitForTimeout(1300);
    assert.equal(await page.evaluate(()=>calls.length),historyCount,"Do not submit incomplete IME input");
    await input.dispatchEvent("compositionend"); await input.press("Enter");
    assert.equal(await page.evaluate(()=>calls.length),historyCount+1);
    await input.fill("cancel on unmount"); await page.evaluate(()=>unmountSearch()); await page.waitForTimeout(1300);
    assert.equal(await page.evaluate(()=>calls.length),historyCount+1);
    await page.evaluate(()=>renderSearch("","legacy")); await input.focus();
    assert.equal(await page.getByRole("listbox").count(),0,"Quote list search must not show autocomplete");
    await page.evaluate(()=>renderSearch("","local")); await input.fill("local"); await input.press("Enter");
    assert.equal(await page.evaluate(()=>submits),0,"Local filtering must not submit the surrounding form");
    await page.getByRole("button",{name:"Clear search"}).click(); assert.equal(await input.inputValue(),"");
    assert.deepEqual(errors,[]);
    console.log("PASS: Clients timing, focus-only entry, rapid typing, late responses, immediate Enter/clear, filter retention, URL history, IME, unmount cleanup, and form safety.");
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
