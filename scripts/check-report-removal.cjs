const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

async function main() {
  const css = await postcss([tailwind({ content: [
    "apps/web/src/app/app/confirm-dialog.tsx",
    "apps/web/src/app/app/tech/remove-report-type-button.tsx",
    "apps/web/src/app/app/tech/remove-report-types-control.tsx"
  ] })]).process("@tailwind base; @tailwind utilities;", { from: undefined });
  const bundle = await build({ stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { RemoveReportTypesControl } from "./apps/web/src/app/app/tech/remove-report-types-control";
    window.calls = []; window.navigation = []; window.pending = false; window.fail = false; window.cleaned = [];
    const tasks = [
      { id: "draft", displayLabel: "Fire alarm", reportStatus: "draft" },
      { id: "signed", displayLabel: "Finished report", reportStatus: "finalized" },
      { id: "future", displayLabel: "Future report", reportStatus: "draft", isAvailableInTechnicianApp: false }
    ];
    const root = createRoot(document.getElementById("app"));
    window.mount = (single = false) => root.render(<main style={{padding:16}}><RemoveReportTypesControl inspectionId="visit" tasks={single ? tasks.slice(0,1) : tasks} /></main>);
    window.mount();
  `, resolveDir: path.resolve(__dirname, ".."), loader: "tsx" }, bundle: true, write: false, jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "test-doubles", setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "test" }));
      builder.onResolve({ filter: /^\.\/actions$/ }, () => ({ path: "action", namespace: "test" }));
      builder.onResolve({ filter: /^\.\/offline\/offline-db$/ }, () => ({ path: "db", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, ({path: id}) => ({ contents: id === "router" ? `
        export function useRouter(){ return { replace(href){window.navigation.push(href)},refresh(){window.navigation.push("refresh")} }; }
      ` : id === "action" ? `
        export async function removeInspectionTaskAction(...args){window.calls.push(args); return window.fail ? {ok:false,error:"Signed report protected"} : {ok:true};}
      ` : `
        export async function listLocalReportDrafts(){return [{inspectionId:"visit", taskId:"draft", reportId:"report", syncStatus:window.pending ? "pending" : "synced"}]}
        export async function listSyncQueueEntries(){return []}
        export async function deleteLocalReportDraft(id){window.cleaned.push(id)}
      ` }));
    }}] });
  const browser = await chromium.launch();
  try {
    for (const width of [390, 900, 1440]) {
      const page = await browser.newPage({viewport:{width,height:850}});
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setContent('<div id="app"></div>');
      await page.addStyleTag({content:css.css});
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.getByText("Remove unneeded report", {exact:true}).click();
      const select = page.getByLabel("Report for this visit");
      assert.deepEqual(await select.locator("option").allTextContents(), ["Select report", "Fire alarm"]);
      await select.selectOption("draft");
      const button = page.getByRole("button", {name:"Remove report",exact:true});
      await button.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", {name:"Cancel",exact:true}).click();
      assert.deepEqual(await page.evaluate(() => window.calls), []);
      await page.evaluate(() => {window.pending = true});
      await button.click();
      await dialog.getByRole("button", {name:"Remove report",exact:true}).click();
      await page.getByText("Wait for this report to sync",{exact:false}).waitFor();
      assert.deepEqual(await page.evaluate(() => window.calls), []);
      await page.evaluate(() => {window.pending = false; window.fail = true});
      await button.click();
      await dialog.getByRole("button", {name:"Remove report",exact:true}).click();
      await page.getByText("Signed report protected",{exact:true}).waitFor();
      assert.deepEqual(await page.evaluate(() => window.navigation), []);
      await page.evaluate(() => {window.fail = false});
      await button.click();
      await dialog.getByRole("button", {name:"Remove report",exact:true}).click();
      await page.getByText("Report type removed.",{exact:true}).waitFor();
      assert.deepEqual(await page.evaluate(() => window.calls), [["visit","draft"],["visit","draft"]]);
      assert.deepEqual(await page.evaluate(() => window.cleaned), ["report"]);
      assert.deepEqual(await page.evaluate(() => window.navigation), ["/app/tech/work","refresh"]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.evaluate(() => window.mount(true));
      await page.getByText("Remove unneeded report",{exact:true}).waitFor({state:"detached"});
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("PASS: report selection, protected report filtering, confirmation/cancel, pending sync, server failure, cache cleanup, navigation and mobile sizing.");
  } finally { await browser.close(); }
}
main().catch(error => {console.error(error); process.exitCode = 1;});
