const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function extract(file, name, context) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let match;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) match = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(match, name);
  const js = ts.transpileModule(match.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return vm.runInNewContext(`${js}\n${name}`, { Error, Date, ...context });
}

async function main() {
  for (const file of ["mobile-checklist-report-screen.tsx", "report-editor.tsx", "use-mobile-report-draft-controller.ts"]) {
    for (const name of ["toTechnicianFacingSaveMessage", "toTechnicianFacingStoredSyncMessage"]) {
      const render = extract(`apps/web/src/app/app/tech/${file}`, name, {});
      for (const message of ["Select an active product or service.", "Start or resume this job before editing."]) {
        assert.equal(render(message, "finalize"), message);
      }
    }
  }
  for (const [file, handler] of [
    ["apps/web/src/app/app/tech/mobile-checklist-report-screen.tsx", "finalizeInspection"],
    ["apps/web/src/app/app/tech/report-editor.tsx", "finalizeReport"]
  ]) {
    const state = extract(file, "buildReportSaveState", { window: { navigator: { onLine: true } } });
    assert.equal(state({ pendingFinalize: true, syncStatus: "failed" }, "draft"), "Finalize failed");
    for (const outcome of ["success", "offline", "error"]) {
      const saves = [], routes = [], queued = [];
      let requests = 0;
      const ref = { current: false };
      const run = extract(file, handler, {
        finalizeInFlightRef: ref, localRecordRef: { current: { pendingFinalize: true, syncStatus: "failed" } },
        saveInFlightRef: { current: false }, dirty: false, draft: {}, draftRef: { current: {} }, latestDraftRef: { current: {} },
        data: { reportId: "report", reportStatus: "draft", template: {} }, taskDisplayLabel: "",
        createDerivedDraft: (_, draft) => draft, setDraft: () => {}, setFinalizeErrorMessage: () => {},
        validateFinalizationDraft: () => {}, trackChecklistEvent: () => {}, clearPendingDraftSyncTimers: () => {},
        persistDraftLocally: async () => {}, toTechnicianFacingSaveMessage: value => value,
        setSaveState: s => saves.push(s), setFinalizeQueued: s => queued.push(s), setDirty: () => {},
        router: { push: r => routes.push(r) }, queueReportFinalizeSync: async () => {
          requests++;
          if (outcome === "error") throw new Error("Required signature");
          return { finalized: outcome === "success" };
        }
      });
      await run();
      assert.equal(requests, 1, `${file}: failed pending finalization must actually retry`);
      assert.equal(saves.at(-1), outcome === "success" ? "Finalized" : outcome === "offline" ? "Finalize queued" : "Finalize failed");
      assert.equal(ref.current, false);
      if (handler === "finalizeInspection") assert.equal(queued.at(-1), outcome === "offline");
      else if (outcome === "error") assert.equal(routes.length, 0);
      else assert.equal(routes.at(-1).includes("queued"), outcome === "offline");
    }
  }
  console.log("PASS: both report screens retry failed pending work, distinguish confirmed/offline completion, and unlock after failure.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
