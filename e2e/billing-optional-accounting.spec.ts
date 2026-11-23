import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test("custom billing line can be submitted with an empty catalog", async ({ page }) => {
  const result = await build({
    stdin: { contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { BillingManualLineForm } from "./apps/web/src/app/app/admin/billing-manual-line-form";
      const save = async (data) => { window.saved = Object.fromEntries(data); return {ok:true,error:null}; };
      createRoot(document.getElementById("app")).render(<BillingManualLineForm action={save} catalogItems={[]} disabled={false} inspectionId="inspection" summaryId="summary" />);
    `, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    alias: { "@/app/search-select": "./apps/web/src/app/search-select.tsx" },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "isolated-actions", setup(builder) {
      builder.onResolve({ filter: /^(next\/navigation|@\/app\/(action-button|toast-provider))$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
        import React from "react";
        export const useRouter = () => ({refresh: () => {}});
        export const useToast = () => ({showToast: () => {}});
        export function ActionButton({children,disabled,pending,type}) { return <button type={type} disabled={disabled || pending}>{children}</button>; }
      `, loader: "tsx", resolveDir: process.cwd() }));
    } }]
  });
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: result.outputFiles[0]!.text });
  await page.getByLabel("Description", { exact: true }).fill("Replacement part");
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("material");
  await page.getByRole("button", { name: "Add line" }).click();
  await expect.poll(() => page.evaluate("window.saved")).toMatchObject({ catalogItemId: "", description: "Replacement part", quantity: "3", category: "material" });
});

test("review and external invoicing remain available without QuickBooks", async ({ page }) => {
  const result = await build({
    stdin: { contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { BillingSummaryStatusActions } from "./apps/web/src/app/app/admin/billing/billing-summary-status-actions";
      window.statuses = [];
      const detail = {status:"draft",quickbooksSyncStatus:null,quickbooksInvoiceNumber:null,quickbooksInvoiceId:null,quickbooksConnectionMode:null,quickbooksSyncedAt:null,quickbooksSendStatus:"not_sent",quickbooksSentAt:null,quickbooksSyncError:null,quickbooksSendError:null};
      const status = async (data) => { window.statuses.push(data.get("status")); return {ok:true,error:null,message:"Saved",detail:{...detail,status:data.get("status")}}; };
      const forbidden = async () => { throw new Error("Accounting connection must not be invoked"); };
      createRoot(document.getElementById("app")).render(<BillingSummaryStatusActions {...detail}
        summaryId="summary" inspectionId="inspection" summaryStatus="draft"
        quickbooksMode={null} quickbooksAppModeLabel="Live" connectedCompany={null} connectedRealm={null}
        canUseQuickBooksActions={false} hasMissingBillingSetup={true} summaryModeMismatch={false}
        syncBillingSummaryToQuickBooksAction={forbidden} sendQuickBooksInvoiceAction={forbidden} updateBillingSummaryStatusAction={status}
      />);
    `, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{ name: "isolated-ui-dependencies", setup(builder) {
      builder.onResolve({ filter: /^(@testworx\/lib|@\/app\/(action-button|toast-provider))$/ }, (args) => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
        import React from "react";
        export const buildQuickBooksInvoiceAppUrl = () => "about:blank";
        export const useToast = () => ({showToast: () => {}});
        export function ActionButton({children,disabled,pending,onClick}) { return <button disabled={disabled || pending} onClick={onClick}>{children}</button>; }
      `, loader: "tsx", resolveDir: process.cwd() }));
    } }]
  });
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: result.outputFiles[0]!.text });
  await expect(page.getByRole("button", { name: /sync.*QuickBooks/i })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark billing reviewed" }).click();
  await expect(page.getByRole("button", { name: "Billing reviewed", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Mark invoiced", exact: true }).click();
  await expect(page.getByRole("button", { name: "Currently invoiced" })).toBeDisabled();
  expect(await page.evaluate("window.statuses")).toEqual(["reviewed", "invoiced"]);
});
