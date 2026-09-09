const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

async function main() {
  const result = await build({
    stdin: { resolveDir: path.resolve(__dirname, ".."), loader: "tsx", contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { useRequestBadge } from "./apps/web/src/app/app/use-request-badge";
      import { RequestCountBadge } from "./apps/web/src/app/app/request-count-badge";
      function App() { const count = useRequestBadge(window.testRole, "/app/admin/dashboard"); return <RequestCountBadge count={count} />; }
      createRoot(document.getElementById("root")).render(<App />);
    ` }, bundle: true, write: false, jsx: "automatic"
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let count = 3;
    let fail = false;
    let calls = 0;
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://localhost/**", (route) => {
      if (route.request().url().includes("/api/admin/service-requests/count")) {
        calls++;
        return route.fulfill({ status: fail ? 503 : 200, contentType: "application/json", body: JSON.stringify({ count }) });
      }
      return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    });
    await page.goto("http://localhost/");
    await page.evaluate(() => { window.testRole = "office_admin"; });
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.getByLabel("3 service requests awaiting review").waitFor();
    count = 4;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByLabel("4 service requests awaiting review").waitFor();
    fail = true;
    const beforeFailure = calls;
    await page.evaluate(() => window.dispatchEvent(new Event("field-request-reviewed")));
    await page.waitForResponse((response) => response.status() === 503);
    assert.ok(calls > beforeFailure);
    assert.equal(await page.getByLabel("4 service requests awaiting review").count(), 1);
    fail = false;
    count = 0;
    await page.evaluate(() => window.dispatchEvent(new Event("field-request-reviewed")));
    await page.getByLabel("4 service requests awaiting review").waitFor({ state: "detached" });
    await page.goto("http://localhost/");
    await page.evaluate(() => { window.testRole = "technician"; });
    const beforeTechnician = calls;
    await page.addScriptTag({ content: result.outputFiles[0].text });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(100);
    assert.equal(calls, beforeTechnician, "Technicians must not request admin counts");
    assert.deepEqual(errors, []);
    console.log("Request badge checks passed: initial count, focus refresh, failure retention, review refresh, zero hidden, technician disabled.");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
