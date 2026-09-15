const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

async function main() {
  const bundle = await build({ stdin: { contents: `
    import { queueReportDraftSync, queueReportFinalizeSync, processSyncQueue, setJobTimeSyncUser } from "./apps/web/src/app/app/tech/offline/offline-sync";
    import { putLocalReportDraft, getLocalReportDraft, putSyncQueueEntry, deleteSyncQueueEntry } from "./apps/web/src/app/app/tech/offline/offline-db";
    window.initialize = async (reportId, inspectionId="job") => putLocalReportDraft({reportId, inspectionId, taskId:reportId, draft:{}, reportStatus:"draft", serverUpdatedAt:new Date().toISOString(), localUpdatedAt:new Date().toISOString(), finalizedAt:null, syncStatus:"synced", pendingFinalize:false, lastError:null});
    window.seed = putSyncQueueEntry;
    window.remove = deleteSyncQueueEntry;
    setJobTimeSyncUser("tech");
    window.save = (reportId) => queueReportDraftSync({reportId, inspectionReportId:reportId, contentJson:{}, taskDisplayLabel:null});
    window.finalize = (reportId) => queueReportFinalizeSync({reportId, inspectionReportId:reportId, contentJson:{complete:true}, taskDisplayLabel:null});
    window.sync = processSyncQueue;
    window.read = getLocalReportDraft;
  `, resolveDir: path.resolve(__dirname, ".."), loader: "ts" }, bundle: true, write: false });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let failure = false, saveStarted = false, invalidSuccess = false;
    const calls = [], errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://localhost/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/api/reports/autosave")) {
        if (route.request().postDataJSON().inspectionReportId === "stale") {
          return route.fulfill({ status: 500, json: { error: "Old report save failed" } });
        }
        saveStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 250));
        calls.push("saved");
        return route.fulfill({ json: { updatedAt: new Date().toISOString() } });
      }
      if (url.includes("/api/reports/finalize")) {
        calls.push("finalize");
        if (invalidSuccess) return route.fulfill({ json: {} });
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
    await page.evaluate(() => window.initialize("invalid-success"));
    invalidSuccess = true;
    assert.match(await page.evaluate(() => window.finalize("invalid-success").catch(e => e.message)), /did not confirm/);
    assert.notEqual((await page.evaluate(() => window.read("invalid-success"))).reportStatus, "finalized");
    invalidSuccess = false;
    assert.equal((await page.evaluate(() => window.finalize("invalid-success"))).finalized, true);
    // Offline completion is queued, never represented as server-confirmed.
    await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }); });
    await page.evaluate(() => window.initialize("offline"));
    assert.equal((await page.evaluate(() => window.finalize("offline"))).finalized, false);
    await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }); return window.sync(); });
    assert.equal((await page.evaluate(() => window.read("offline"))).reportStatus, "finalized");
    // A clock conflict from another job must not stop a valid finalization.
    await page.evaluate(async () => {
      await window.initialize("other-job-report", "current-job");
      await window.seed({id:"old-clock", entityType:"job_time", entityId:"old-session", operation:"job_time_event", status:"conflict", retryCount:1,
        lastError:"Closed jobs cannot be started.", createdAt:"2026-01-01T00:00:00Z", updatedAt:"2026-01-01T00:00:00Z", lastAttemptAt:null,
        payload:{inspectionId:"old-job", userId:"tech", action:"start"}});
    });
    assert.equal((await page.evaluate(() => window.finalize("other-job-report"))).finalized, true, "Old job conflicts must not block current job finalization");
    await page.evaluate(() => window.remove("old-clock"));
    await page.evaluate(async () => {
      await window.initialize("stale", "stale-job");
      await window.initialize("unrelated-report", "unrelated-job");
      await window.seed({id:"stale-save", entityType:"inspection_report", entityId:"stale", operation:"report_autosave", status:"failed", retryCount:1,
        lastError:"Old report save failed", createdAt:"2026-01-01T00:00:00Z", updatedAt:"2026-01-01T00:00:00Z", lastAttemptAt:null,
        payload:{inspectionReportId:"stale", contentJson:{}}});
    });
    assert.equal((await page.evaluate(() => window.finalize("unrelated-report"))).finalized, true, "A failed save on another job must not stop finalization");
    await page.evaluate(() => window.remove("stale-save"));
    // An unresolved material save on this job must still block finalization.
    await page.evaluate(async () => {
      await window.initialize("blocked-report", "blocked-job");
      await window.seed({id:"material-conflict", entityType:"work_order_line_item", entityId:"line", operation:"work_order_line_upsert", status:"conflict", retryCount:1,
        lastError:"Material needs correction", createdAt:"2026-01-01T00:00:00Z", updatedAt:"2026-01-01T00:00:00Z", lastAttemptAt:null,
        payload:{inspectionId:"blocked-job"}});
    });
    const blockedAt = calls.length;
    assert.match(await page.evaluate(() => window.finalize("blocked-report").catch(error => error.message)), /pending|sync|correction/i);
    assert.equal(calls.length, blockedAt, "Must not finalize past unsaved materials on the same job");
    assert.equal((await page.evaluate(() => window.read("blocked-report"))).syncStatus, "failed", "Blocked finalization must unlock correction controls, not stay Finalizing");
    assert.match((await page.evaluate(() => window.read("blocked-report"))).lastError, /Material needs correction/);
    await page.evaluate(() => window.remove("material-conflict"));
    assert.equal((await page.evaluate(() => window.finalize("blocked-report"))).finalized, true);
    assert.deepEqual(errors, []);
    console.log("PASS: in-flight saves, confirmed finalization, validation retries, offline finalization, cross-job failure isolation, same-job material protection, and no browser errors.");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
