// Real React board, two browser sessions, shared API fixture (no customer records touched).
const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
async function main() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  const job = { id: "job", customer: "Scheduler QA", site: "Test site", address: "1 Main", types: ["fire_alarm"], technicianIds: ["a"], scheduledStart: `${today}T15:00:00Z`, scheduledEnd: `${today}T16:00:00Z`, updatedAt: new Date().toISOString(), status: "to_be_completed", sessions: [] };
  const data = (days) => ({ timezone: "America/Chicago", days, fetchedAt: new Date().toISOString(), truncated: false, technicians: [{ id: "a", name: "Tech Alpha", isActive: true }, { id: "b", name: "Tech Beta", isActive: true }], jobs: [job] });
const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SchedulerBoard} from './apps/web/src/app/app/admin/scheduler/scheduler-board'; createRoot(document.getElementById('app')).render(<SchedulerBoard initial={${JSON.stringify(data([today]))}} initialView="day"/>);`, loader: "tsx", resolveDir: path.resolve(__dirname, "..") }, bundle: true, write: false, outdir: "scheduler-test", jsx: "automatic", tsconfig: "apps/web/tsconfig.json", define: { "process.env.NODE_ENV": '"production"' }, plugins: [{ name: "link-stub", setup(b) { b.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" })); b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ resolveDir: path.resolve(__dirname, ".."), contents: `import React from 'react'; export default function Link(p){return React.createElement('a',p)}` })); } }] });
  const browser = await chromium.launch();
  const errors = [];
  try {
    const office = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const tech = await browser.newContext();
    for (const context of [office, tech]) await context.route("http://localhost/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/fixture/progress") {
        const action = route.request().postDataJSON().action;
        if (action === "start") job.sessions = [{ technicianId: "b", startedAt: new Date().toISOString(), endedAt: null, endReason: null }];
        else { job.sessions[0].endedAt = new Date().toISOString(); job.sessions[0].endReason = "field_finished"; }
        return route.fulfill({ json: { ok: true } });
      }
      if (url.pathname === "/api/admin/scheduler") {
        if (route.request().method() === "POST") {
          const input = route.request().postDataJSON();
          job.technicianIds = input.technicianIds;
          job.scheduledStart = `${input.start}:00Z`; job.scheduledEnd = `${input.end}:00Z`; job.updatedAt = new Date().toISOString();
          return route.fulfill({ json: { ok: true, job } });
        }
        if (url.searchParams.has("id")) return route.fulfill({ json: { job } });
        if (url.searchParams.has("q")) return route.fulfill({ json: { jobs: [job] } });
        const day = url.searchParams.get("date") || today;
        const start = new Date(`${day}T12:00Z`);
        if (url.searchParams.get("view") === "week") start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
        const days = Array.from({ length: url.searchParams.get("view") === "week" ? 7 : 1 }, (_, i) => new Date(+start + i * 86400000).toISOString().slice(0, 10));
        return route.fulfill({ json: data(days) });
      }
      return route.fulfill({ contentType: "text/html", body: '<style>*{box-sizing:border-box}body{margin:0;padding:16px;font-family:sans-serif}</style><div id="app"></div>' });
    });
    const page = await office.newPage(), field = await tech.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    async function mount() {
      await page.goto("http://localhost/app/admin/scheduler");
      await page.addStyleTag({ content: bundle.outputFiles.find((f) => f.path.endsWith(".css")).text });
      await page.addScriptTag({ content: bundle.outputFiles.find((f) => f.path.endsWith(".js")).text });
      await page.getByRole("heading", { name: "Scheduler", exact: true }).waitFor();
    }
    await mount();
    assert(await page.getByText("No jobs scheduled", { exact: true }).count() >= 1);
    assert.equal(await page.getByRole("link", { name: "Add Job", exact: true }).getAttribute("href"), "/app/admin/inspections?create=1");
    await page.getByRole("button", { name: /Scheduler QA/ }).filter({has:page.locator("strong")}).first().click();
    await page.getByRole("button", { name: "Reschedule / reassign", exact: true }).click();
    await page.getByLabel("Start (America/Chicago) date", { exact: true }).fill("2026-11-26");
    await page.getByLabel("Start (America/Chicago) hour", { exact: true }).selectOption("9");
    await page.getByLabel("End date", { exact: true }).fill("2026-11-26");
    await page.getByLabel("End hour", { exact: true }).selectOption("10");
    await page.getByLabel("Tech Alpha", { exact: true }).uncheck();
    await page.getByLabel("Tech Beta", { exact: true }).check();
    await page.getByRole("button", { name: "Save schedule" }).click();
    await page.getByRole("button", { name: "Reschedule / reassign" }).waitFor();
    const inspectionLink = page.getByRole("link", { name: "Open inspection", exact: true });
    assert.equal(await inspectionLink.getAttribute("target"), null);
    assert.deepEqual(job.technicianIds, ["b"]);
    await page.getByRole("button", { name: "Close job details" }).click();
    await page.getByLabel("Schedule date").fill("2026-11-26");
    await page.getByRole("button", { name: "Week", exact: true }).click();
    await page.getByRole("button", { name: "Thu, Nov 26" }).click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    job.scheduledStart = `${today}T15:00:00Z`; job.scheduledEnd = `${today}T16:00:00Z`;
    await mount();
    await field.goto("http://localhost/field");
    await field.evaluate(() => fetch("/fixture/progress", { method: "POST", body: JSON.stringify({ action: "start" }) }));
    await page.bringToFront();
    await page.getByText(/In progress/).first().waitFor({ timeout: 20000 });
    await field.evaluate(() => fetch("/fixture/progress", { method: "POST", body: JSON.stringify({ action: "finish" }) }));
    await page.bringToFront();
    await page.getByText("Work finished", { exact: true }).first().waitFor({ timeout: 20000 });
    assert.equal(job.status, "to_be_completed");
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
      if (width === 390 || width === 1440) await page.screenshot({ path: `.vercel/scheduler-${width}.png` });
    }
    assert.deepEqual(errors, []);
    console.log("PASS: Scheduler scheduling/reassignment, week/day navigation, two-context progress polling, unchanged report status, empty rows, phone/tablet/desktop containment. API is a fixture, not authenticated production E2E.");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
