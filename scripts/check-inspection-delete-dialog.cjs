const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

async function main() {
  const files = ["apps/web/src/app/app/confirm-dialog.tsx", "apps/web/src/app/app/admin/inspections/fast-inspection-delete-button.tsx"];
  const css = await postcss([tailwind({ content: files, theme: { extend: {} } })]).process("@tailwind base; @tailwind utilities;", { from: undefined });
  const bundle = await build({ stdin: { contents: `
    import React, { StrictMode } from "react";
    import { createRoot } from "react-dom/client";
    import { FastInspectionDeleteButton } from "./apps/web/src/app/app/admin/inspections/fast-inspection-delete-button";
    window.calls = []; window.navigation = []; window.fail = false;
    const root = createRoot(document.getElementById("app"));
    window.mount = (recurring = false) => root.render(<StrictMode><main id="scroll" style={{height:"80vh", overflow:"auto"}}>
      <div style={{height:700}}/><div id="row" style={{padding:20,border:"1px solid gray",transform:"translateZ(0)",overflow:"hidden"}}>
        <FastInspectionDeleteButton key={String(recurring)} inspectionId="test-job" customerLabel="Test customer" hasRecurrence={recurring}
          redirectTo="/app/admin/inspections?status=open" action={async (_, data) => {
            window.calls.push(Object.fromEntries(data)); await new Promise(resolve => setTimeout(resolve, 150));
            if(window.fail) return {error:"Deletion blocked for invoiced work",success:null,redirectTo:null};
            return {error:null,success:"Deleted",redirectTo:"/app/admin/inspections?status=open",deletedInspectionIds:["test-job"]};
          }}/>
      </div><div style={{height:700}}/></main></StrictMode>);
    window.mount();
  `, resolveDir: path.resolve(__dirname, ".."), loader: "tsx" }, bundle: true, write: false, jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' }, plugins: [{ name: "router-test-double", setup(builder) {
      builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: `export function useRouter(){return {refresh(){window.navigation.push("refresh")},replace(href,options){window.navigation.push({href,options})}}}` }));
    }}] });
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 900, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.route("http://localhost/**", route => route.fulfill({ contentType: "text/html", body: '<div id="app"></div>' }));
      await page.goto("http://localhost/app/admin/inspections?status=open");
      await page.addStyleTag({ content: css.css });
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const trigger = page.getByRole("button", { name: "Delete", exact: true });
      await trigger.scrollIntoViewIfNeeded();
      const scroll = await page.locator("#scroll").evaluate(el => el.scrollTop);
      await trigger.dblclick();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      assert.equal(await dialog.count(), 1);
      assert.equal(await dialog.evaluate(el => el.parentElement === document.body), true);
      const bounds = await dialog.boundingBox();
      assert.equal(bounds.x, 0); assert.equal(bounds.y, 0); assert.equal(bounds.width, width);
      for (let n = 0; n < 8; n++) {
        await dialog.getByRole("button", { name: "Delete inspection", exact: true }).hover();
        await page.mouse.move(2, 2);
        assert.deepEqual(await dialog.boundingBox(), bounds, "Hover must not move or hide the modal");
      }
      await dialog.getByRole("button", { name: "Close confirmation" }).focus();
      await page.keyboard.press("Shift+Tab");
      assert.equal(await dialog.getByRole("button", { name: "Delete inspection", exact: true }).evaluate(el => el === document.activeElement), true);
      await page.keyboard.press("Tab");
      assert.equal(await dialog.getByRole("button", { name: "Close confirmation" }).evaluate(el => el === document.activeElement), true);
      await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
      await page.keyboard.press("Enter");
      await dialog.waitFor({ state: "detached" });
      assert.equal(await page.evaluate(() => window.calls.length), 0, "Enter on Cancel must not delete");
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
      assert.equal(await page.locator("#scroll").evaluate(el => el.scrollTop), scroll);
      await trigger.click(); await page.keyboard.press("Escape"); await dialog.waitFor({ state: "detached" });
      await trigger.click(); await page.mouse.click(2, 2); await dialog.waitFor({ state: "detached" });
      assert.equal(await page.evaluate(() => window.calls.length), 0);
      await page.evaluate(() => { window.fail = true; });
      await trigger.click(); await dialog.getByRole("button", { name: "Delete inspection", exact: true }).click();
      await page.getByText("Deletion blocked for invoiced work").waitFor();
      assert.equal(await trigger.isEnabled(), true);
      await page.evaluate(() => { window.fail = false; });
      await trigger.dblclick(); await dialog.getByRole("button", { name: "Delete inspection", exact: true }).click();
      await page.getByRole("button", { name: "Deleted", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Deleted", exact: true }).isDisabled(), true);
      assert.deepEqual(await page.evaluate(() => window.calls.map(c => c.deleteScope)), ["single", "single"]);
      assert.deepEqual(await page.evaluate(() => window.navigation), ["refresh"]);
      for (const [label, scope] of [["Delete only this inspection", "single"], ["Delete this and all future", "future"]]) {
        await page.evaluate(() => window.mount(true));
        await trigger.click();
        await dialog.getByRole("button", { name: label, exact: true }).focus();
        await page.keyboard.press("Enter");
        await page.getByRole("button", { name: "Deleted", exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.calls.at(-1).deleteScope), scope);
        await page.evaluate(() => window.mount(false));
        await trigger.waitFor();
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("PASS: viewport portal, stable hover, cancel/escape/focus, double clicks, failure retry, navigation, and both recurrence scopes at desktop/split/mobile sizes.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
