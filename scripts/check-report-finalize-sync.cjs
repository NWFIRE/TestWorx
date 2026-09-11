const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

async function main() {
  const bundle = await build({ stdin: { contents: `
    import { queueReportDraftSync, queueReportFinalizeSync, processSyncQueue } from "./apps/web/src/app/app/tech/offline/offline-sync";
    import { putLocalReportDraft, getLocalReportDraft } from "./apps/web/src/app/app/tech/offline/offline-db";
    window.initialize = async (reportId) => putLocalReportDraft({reportId, inspectionId:"job", taskId:reportId, draft:{}, reportStatus:"draft", serverUpdatedAt:new Date().toISOString(), localUpdatedAt:new Date().toISOString(), finalizedAt:null, syncStatus:"synced", pendingFinalize:false, lastError:null});
    window.save = (reportId) => queueReportDraftSync({reportId, inspectionReportId:reportId, contentJson:{}, taskDisplayLabel:null});
    window.finalize = (reportId) => queueReportFinalizeSync({reportId, inspectionReportId:reportId, contentJson:{complete:true}, taskDisplayLabel:null});
    window.sync = processSyncQueue;
    window.read = getLocalReportDraft;
  `, resolveDir: path.resolve(__dirname, ".."), loader: "ts" }, bundle: true, write: false });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let failure = false, saveStarted = false;
    const calls = [], errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://localhost/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/api/reports/autosave")) {
        saveStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 250));
        calls.push("saved");
        return route.fulfill({ json: { updatedAt: new Date().toISOString() } });
      }
      if (url.includes("/api/reports/finalize")) {
        calls.push("finalize");
        if (failure) return route.fulfill({ status: 422, json: { error: "Customer signature is required before finalizing." } });
        return route.fulfill({ json: { status: "finalized", finalizedAt: new Date().toISOString() } });
      }
      return route.fulfill({ contentType: "text/html", body: "<main>Finalize sync test</main>" });
    });
    await page.goto("http://localhost/test");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.initialize("report"));
    await page.evaluate(() => window.save("report"));
    while (!saveStarted) await page.waitForTimeout(10);
    const result = await page.evaluate(() => window.finalize("report"));
    assert.equal(result.finalized, true);
    assert.deepEqual(calls, ["saved", "finalize"]);
    assert.equal((await page.evaluate(() => window.read("report"))).reportStatus, "finalized");
    // A failed request cannot be reported as successful; corrected retries work.
    await page.evaluate(() => window.initialize("retry"));
    failure = true;
    const message = await page.evaluate(() => window.finalize("retry").catch((error) => error.message));
    assert.match(message, /signature is required/);
    const before = calls.length;
    await page.evaluate(() => window.sync());
    assert.equal(calls.length, before, "validation errors should wait for correction");
    failure = false;
    assert.equal((await page.evaluate(() => window.finalize("retry"))).finalized, true);
    // Offline completion is queued, never represented as server-confirmed.
    await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }); });
    await page.evaluate(() => window.initialize("offline"));
    assert.equal((await page.evaluate(() => window.finalize("offline"))).finalized, false);
    await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }); return window.sync(); });
    assert.equal((await page.evaluate(() => window.read("offline"))).reportStatus, "finalized");
    assert.deepEqual(errors, []);
    console.log("PASS: finalize waits for in-flight saves, confirms server success, reports validation failures, retries corrections, and preserves offline finalization.");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
