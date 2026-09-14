const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

async function main() {
  const bundle = await build({ stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { ResolvedRequestDetails } from "./apps/web/src/app/app/admin/service-requests/resolved-request-details";
    const request = {id:"request", title:"Replace damaged equipment", priority:"urgent", customerCompany:{name:"Test Customer"}, site:{name:"Main Site",addressLine1:"123 Main St",city:"Enid",state:"OK"}, requestedBy:{name:"Technician One",email:"tech@example.com"}, createdAt:"2026-09-14T15:00:00Z", description:"Inspect the damaged unit.\\nReplace as needed.", equipmentContext:"Unit 12 near rear exit", preferredTiming:"Next week", adminNote:"Scheduled replacement visit", reviewedBy:{name:"Office Admin"}, reviewedAt:"2026-09-14T16:00:00Z"};
    createRoot(document.getElementById("root")).render(<><ResolvedRequestDetails request={request} timezone="America/Chicago" statusLabel="Resolved" typeLabel="Service ticket"/><ResolvedRequestDetails request={{...request,id:"declined",site:null,adminNote:null,reviewedAt:null,reviewedBy:null,equipmentContext:null,preferredTiming:null}} timezone="America/Chicago" statusLabel="Declined" typeLabel="Work order"/></>);
  `, loader: "tsx", resolveDir: path.resolve(__dirname, "..") }, bundle: true, write: false, jsx: "automatic" });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent('<main id="root"></main>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const first = page.locator("details").first();
    await first.locator("summary").waitFor();
    assert.equal(await first.getAttribute("open"), null);
    await first.locator("summary").click();
    assert.notEqual(await first.getAttribute("open"), null);
    for (const text of ["Inspect the damaged unit.", "Unit 12 near rear exit", "Next week", "Scheduled replacement visit", "123 Main St", "tech@example.com", "10:00 AM", "11:00 AM"]) {
      assert.ok((await first.innerText()).includes(text), text);
    }
    await first.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await first.getAttribute("open"), null);
    await page.keyboard.press("Space");
    assert.notEqual(await first.getAttribute("open"), null);
    const second = page.locator("details").nth(1);
    await second.locator("summary").click();
    assert.ok((await second.innerText()).includes("No office note recorded."));
    assert.ok((await second.innerText()).includes("No specific site selected"));
    assert.equal(await page.locator("form, input, textarea, button, a").count(), 0, "History is read-only");
    assert.deepEqual(errors, []);
    console.log("PASS: resolved/declined details, full notes, tenant-timezone dates, keyboard toggling, optional fields, and read-only history.");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
