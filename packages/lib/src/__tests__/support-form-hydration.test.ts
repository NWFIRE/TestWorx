import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { expect, it, vi } from "vitest";

it("support forms wait for client initialization before accepting their first action", () => {
  const require = createRequire(import.meta.url);
  const exports: any = {};
  const source = ts.transpileModule(readFileSync(new URL("../../../../apps/web/src/app/app/help/forms.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(source, { exports, require: (id: string) => id === "next/navigation" ? { useRouter: () => ({}) }
    : id === "./actions" ? {}
    : id === "react" ? { ...require(id), useActionState: () => [{ error: "" }, undefined, false] } : require(id) });
  for (const [component, props] of [
    [exports.ProblemForm, { pagePath: "/app", errorReference: "", reportId: "" }],
    [exports.RetryDeliveryForm, { ticketId: "ticket", deliveryId: "delivery" }],
    [exports.ReplyForm, { id: "ticket", operator: true, resolved: false, operators: [], assigned: null }],
    [exports.ReplyForm, { id: "ticket", operator: false, resolved: true, operators: [], assigned: null }]
  ] as const) {
    const html = renderToStaticMarkup(createElement(component, props));
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every(button => button.includes('disabled=""'))).toBe(true);
  }
});

it("reloads the ticket only after confirmed success, not after a failed save", () => {
  const require = createRequire(import.meta.url);
  const source = ts.transpileModule(readFileSync(new URL("../../../../apps/web/src/app/app/help/forms.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  for (const state of [{ error: "Unable to save" }, { error: "", saved: true }]) {
    const exports: any = {};
    const reload = vi.fn();
    runInNewContext(source, { exports, window: { location: { reload } }, require: (id: string) => id === "next/navigation" ? { useRouter: () => ({}) }
      : id === "./actions" ? {}
      : id === "react" ? { ...require(id), useActionState: () => [state, undefined, false], useEffect: (effect: () => void) => effect() } : require(id) });
    renderToStaticMarkup(createElement(exports.ReplyForm, { id: "ticket", operator: false, resolved: true, operators: [], assigned: null }));
    expect(reload).toHaveBeenCalledTimes("saved" in state ? 1 : 0);
  }
});
