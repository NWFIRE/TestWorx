import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = ts.transpileModule(readFileSync(new URL("../../../../apps/web/src/app/app/tech/offline/offline-db.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function setup() {
  const open: any = {};
  const request: any = {};
  const transaction: any = { objectStore: () => ({ put: () => request }) };
  const exports: any = {};
  const dispatchEvent = vi.fn();
  runInNewContext(source, { exports, process: { env: {} }, window: { indexedDB: { open: () => open }, dispatchEvent }, CustomEvent: class {} });
  return { exports, open, request, transaction, dispatchEvent };
}
describe("offline write durability", () => {
  it("does not announce saved work until the transaction commits", async () => {
    const s = setup(); let saved = false;
    const promise = s.exports.putLocalReportDraft({ reportId: "A" }).then(() => { saved = true; });
    s.open.result = { transaction: () => s.transaction }; s.open.onsuccess();
    await Promise.resolve(); s.request.onsuccess(); await Promise.resolve();
    expect(saved).toBe(false); expect(s.dispatchEvent).not.toHaveBeenCalled();
    s.transaction.oncomplete(); await promise;
    expect(saved).toBe(true); expect(s.dispatchEvent).toHaveBeenCalledTimes(1);
  });
  it("rejects a successful request if its transaction later aborts", async () => {
    const s = setup(); const promise = s.exports.putLocalReportDraft({ reportId: "A" });
    s.open.result = { transaction: () => s.transaction }; s.open.onsuccess();
    await Promise.resolve(); s.request.onsuccess(); s.transaction.onabort();
    await expect(promise).rejects.toThrow(/aborted/);
    expect(s.dispatchEvent).not.toHaveBeenCalled();
  });
});
