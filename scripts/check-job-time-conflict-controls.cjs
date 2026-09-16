const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

async function main() {
  const bundle = await build({ stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { useJobTime, JobTimeControl } from "./apps/web/src/app/app/tech/job-time-control";
    import { putSyncQueueEntry } from "./apps/web/src/app/app/tech/offline/offline-db";
    window.seed = putSyncQueueEntry;
    function App() {
      const timer = useJobTime("current-job", "tech");
      return <><JobTimeControl timer={timer}/><output>{timer.canEdit ? "editable" : "locked"}</output></>;
    }
    window.mount = () => createRoot(document.getElementById("app")).render(<App/>);
  `, resolveDir: path.resolve(__dirname, ".."), loader: "tsx" }, bundle: true, write: false, jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    let active = { id: "valid-session", inspectionId: "current-job", startedAt: new Date().toISOString(), endedAt: null, needsReview: false };
    await page.route("http://localhost/**", route => route.request().url().includes("/api/tech/job-time")
      ? route.fulfill({ json: { active, sessions: active ? [active] : [], closed: false, timezone: "America/Chicago" } })
      : route.fulfill({ contentType: "text/html", body: '<div id="app"></div>' }));
    await page.goto("http://localhost/test");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(async () => {
      for (const inspectionId of ["current-job", "other-job"]) await window.seed({
        id: inspectionId, entityType: "job_time", entityId: inspectionId, operation: "job_time_event", status: "conflict", retryCount: 1,
        lastError: "Overlapping job time needs office review.", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastAttemptAt: null,
        payload: { userId: "tech", inspectionId, sessionId: inspectionId, action: "start", occurredAt: new Date().toISOString() }
      });
      window.mount();
    });
    await page.waitForFunction(() => document.querySelector("output")?.textContent === "editable");
    assert.equal(await page.getByRole("button", { name: "Pause job", exact: true }).isEnabled(), true);
    assert.equal(await page.getByRole("button", { name: "Retry job time sync" }).isEnabled(), true);
    active = null;
    await page.evaluate(() => window.dispatchEvent(new Event("job-time-changed")));
    await page.waitForFunction(() => document.querySelector("output")?.textContent === "locked");
    assert.equal(await page.getByRole("button", { name: "Start job", exact: true }).isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log("PASS: rejected starts preserve valid session controls; unstarted jobs stay locked; recovery remains accessible.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
