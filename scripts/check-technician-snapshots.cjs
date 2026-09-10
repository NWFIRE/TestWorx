const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

async function main() {
  const bundle = await build({ stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { useOfflineScreenSnapshot } from "./apps/web/src/app/app/tech/offline/use-offline-screen-snapshot";
    import { putScreenSnapshot, getScreenSnapshot } from "./apps/web/src/app/app/tech/offline/offline-db";
    import { markTechnicianScreenSnapshot } from "./apps/web/src/app/app/tech/offline/screen-snapshot-version";
    import { runTechnicianFullSync } from "./apps/web/src/app/app/tech/offline/technician-full-sync";
    const initial = { dashboard: { assigned: ["stale-job"] } };
    window.writeSnapshot = (assigned) => putScreenSnapshot("technician-inspections", markTechnicianScreenSnapshot({ dashboard: { assigned } }));
    window.readSnapshot = () => getScreenSnapshot("technician-inspections");
    window.sync = runTechnicianFullSync;
    function App() {
      const snapshot = useOfflineScreenSnapshot("technician-inspections", initial);
      return <div data-testid="jobs">{snapshot?.dashboard.assigned.join(",") ?? "loading"}</div>;
    }
    const root = createRoot(document.getElementById("root"));
    window.mount = () => root.render(<App/>);
    window.unmount = () => root.render(null);
    window.mount();
  `, resolveDir: path.resolve(__dirname, ".."), loader: "tsx" }, bundle: true, write: false, jsx: "automatic" });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let assigned = ["open-job"], requests = 0, delay = 0, fail = false;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://localhost/**", async (route) => {
      if (route.request().url().includes("/api/tech/sync")) {
        requests++;
        if (fail) return route.fulfill({ status: 503, json: { error: "Temporarily unavailable" } });
        const captured = [...assigned];
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        return route.fulfill({ json: { dashboard: { assigned: captured }, manuals: [], user: {}, syncedAt: new Date().toISOString() } });
      }
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://localhost/test");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const jobs = page.getByTestId("jobs");
    await jobs.filter({ hasText: /^open-job$/ }).waitFor();
    await page.evaluate(() => window.writeSnapshot(["updated-job"]));
    await jobs.filter({ hasText: /^updated-job$/ }).waitFor();
    // Finalization refreshes the visible list without navigation.
    assigned = [];
    await page.evaluate(() => window.dispatchEvent(new Event("job-time-changed")));
    await page.waitForFunction(() => document.querySelector('[data-testid="jobs"]').textContent === "");
    // A completion during an older fetch must not restore the finished job.
    assigned = ["finishing-job"]; delay = 200;
    await page.evaluate(() => { void window.sync(); });
    await page.waitForTimeout(50);
    assigned = [];
    await page.evaluate(() => window.dispatchEvent(new Event("job-time-changed")));
    await page.evaluate(() => window.sync());
    assert.equal(await jobs.textContent(), "");
    delay = 0;
    // Returning to the app picks up office changes.
    assigned = ["new-assignment"];
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await jobs.filter({ hasText: /^new-assignment$/ }).waitFor();
    const beforeBurst = requests;
    await page.evaluate(() => Promise.all([window.sync(), window.sync(), window.sync()]));
    assert.equal(requests, beforeBurst + 1);
    fail = true;
    await page.evaluate(() => window.sync().catch(() => {}));
    assert.equal(await jobs.textContent(), "new-assignment");
    fail = false;
    // Offline remount preserves the newer cached list, not stale route props.
    await page.evaluate(() => { Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }); window.unmount(); });
    await page.waitForTimeout(50);
    const beforeOffline = requests;
    await page.evaluate(() => window.mount());
    await jobs.filter({ hasText: /^new-assignment$/ }).waitFor();
    assert.equal(requests, beforeOffline);
    assert.deepEqual((await page.evaluate(() => window.readSnapshot())).payload.dashboard.assigned, ["new-assignment"]);
    assert.deepEqual(errors, []);
    console.log("PASS: live snapshot updates, completion, in-flight refresh, focus refresh, offline cache preservation, no page errors.");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
