const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
async function main() {
  const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {MonthlyExportButton} from './apps/web/src/app/app/admin/inspections/monthly/export-button'; createRoot(document.getElementById('app')).render(<MonthlyExportButton month="2026-09" timezone="America/Chicago" rows={[{id:'inspection-id',values:['REF','Customer, LLC','Site','Address','Sep 1, 2026','Fire alarm','Completed','Standard','Normal','Alex']}]} />);`, loader: "tsx", resolveDir: path.resolve(__dirname, "..") }, bundle: true, write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ acceptDownloads: true });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.setContent('<div id="app"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    const download = await pending;
    assert.equal(download.suggestedFilename(), "inspections-2026-09.csv");
    const csv = await fs.readFile(await download.path(), "utf8");
    assert.ok(csv.includes('"Customer, LLC"'));
    assert.ok(csv.includes('"America/Chicago","inspection-id"'));
    assert.equal(csv.split("\r\n").length, 2);
    assert.deepEqual(errors, []);
    console.log("PASS: actual CSV button downloads matching rows with the correct filename, quoting and timezone without navigation or browser errors.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
