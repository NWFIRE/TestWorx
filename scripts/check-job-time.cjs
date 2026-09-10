const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

async function main() {
  const bundle = await build({ stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client";
    import { JobTimeControl, useJobTime } from "./apps/web/src/app/app/tech/job-time-control";
    import { queueReportDraftSync, processSyncQueue } from "./apps/web/src/app/app/tech/offline/offline-sync";
    window.syncJob = processSyncQueue;
    function App() { const timer = useJobTime("job", "tech"); return <><JobTimeControl timer={timer} beforePause={async () => { await queueReportDraftSync({reportId:"report",inspectionReportId:"report",contentJson:{},taskDisplayLabel:null}); }} /><input aria-label="Report field" disabled={!timer.canEdit}/></>; }
    createRoot(document.getElementById("root")).render(<App/>);`, resolveDir: path.resolve(__dirname, ".."), loader: "tsx" }, bundle: true, write: false, jsx: "automatic" });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let sessions = [], active = null, closed = false;
    const calls = [], errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://localhost/**", async (route) => {
      const request = route.request();
      if (request.url().includes("/api/tech/job-time")) {
        if (request.method() === "POST") {
          const event = request.postDataJSON(); calls.push(event.action);
          if (event.action === "start") { active = { id: event.sessionId, inspectionId: "job", startedAt: event.occurredAt, endedAt: null }; sessions.push(active); }
          else { active.endedAt = event.occurredAt; active = null; }
          return route.fulfill({ json: { ok: true } });
        }
        return route.fulfill({ json: { sessions, active, closed, timezone: "America/Chicago" } });
      }
      if (request.url().includes("/api/reports/autosave")) { calls.push("save"); return route.fulfill({ json: { updatedAt: new Date().toISOString() } }); }
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://localhost/job-test");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const field = page.getByRole("textbox", { name: "Report field" });
    await page.getByRole("button", { name: "Start job", exact: true }).waitFor();
    assert.equal(await field.isDisabled(), true);
    assert.equal(calls.length, 0, "Viewing must not start the job");
    await page.getByRole("button", { name: "Start job", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('input').disabled);
    await page.getByRole("button", { name: "Pause job", exact: true }).click();
    await page.getByRole("button", { name: "Resume job", exact: true }).waitFor();
    assert.equal(await field.isDisabled(), true);
    assert.deepEqual(calls, ["start", "save", "pause"], "Saving must precede pausing");
    await page.evaluate(() => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }));
    await page.getByRole("button", { name: "Resume job", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('input').disabled);
    assert.equal(calls.length, 3, "Offline start stays on device");
    await page.getByRole("button", { name: "Pause job", exact: true }).click();
    await page.getByRole("button", { name: "Resume job", exact: true }).waitFor();
    await page.evaluate(async () => { Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true }); await window.syncJob(); });
    assert.deepEqual(calls, ["start", "save", "pause", "start", "save", "pause"]);
    await page.getByRole("button", { name: "Resume job", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('input').disabled);
    closed = true; active.endedAt = new Date().toISOString(); active = null;
    await page.evaluate(() => window.dispatchEvent(new Event("job-time-changed")));
    await page.getByText("Job complete", { exact: true }).waitFor();
    assert.equal(await field.isDisabled(), true);
    assert.deepEqual(errors, []);
    console.log("Job timer browser checks passed: view-only, start, pause, resume, save-before-pause, offline ordered sync, completion lock, and no page errors.");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
