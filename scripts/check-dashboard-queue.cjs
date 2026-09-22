const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { buildSync } = require("esbuild");

const result = buildSync({ entryPoints: ["apps/web/src/app/app/admin/dashboard/queue-summary.ts"], bundle: true, write: false, platform: "node", format: "cjs" });
const sandbox = { module: { exports: {} } };
vm.runInNewContext(result.outputFiles[0].text, sandbox);
const { summarizeDashboardQueue } = sandbox.module.exports;
const summarize = rows => JSON.parse(JSON.stringify(summarizeDashboardQueue(rows)));
assert.deepEqual(summarize([]), { openInspectionCount: 0, sharedQueueCount: 0 });
assert.deepEqual(summarize([
  { assignedTechnicianNames: [] },
  { assignedTechnicianNames: ["Primary technician"] },
  { assignedTechnicianNames: ["Additional technician", "Office admin"] },
  { assignedTechnicianNames: [] }
]), { openInspectionCount: 4, sharedQueueCount: 2 });
const page = fs.readFileSync("apps/web/src/app/app/admin/dashboard/page.tsx", "utf8");
assert.ok(page.includes("summarizeDashboardQueue(dashboardOperationalInspections)"));
assert.ok(page.includes("buildAlertItems(data, sharedQueueCount,"));
assert.ok(page.includes("dueWindowEnd: fastManagementWindowEnd"));
assert.ok(page.includes("filterSubsetDuplicateOperationalInspections(schedulingQueueData.inspections)"));
assert.ok(!page.includes("data.summary.unassignedInspections"), "Do not use the all-future claimable count for the operational alert");
console.log("PASS: dashboard shared queue uses the same bounded, deduplicated rows as Open inspections and excludes assigned jobs.");
