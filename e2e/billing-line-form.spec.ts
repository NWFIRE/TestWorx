import { expect, test } from "@playwright/test";
import { build } from "esbuild";

test.beforeEach(async ({ page }) => {
  const bundle = await build({
    stdin: { contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { BillingLineForm } from "./apps/web/src/app/app/admin/billing/[inspectionId]/billing-line-form";
      window.calls = [];
      window.fail = true;
      const save = async (data) => {
        window.calls.push(Object.fromEntries(data));
        await new Promise(resolve => setTimeout(resolve, 200));
        if (window.fail) throw new Error("Refresh before saving again.");
      };
      const remove = async (data) => { window.removed = data.get("intent"); };
      createRoot(document.getElementById("app")).render(<BillingLineForm saveAction={save} removeAction={remove}>
        <label>Description<input name="description" required defaultValue="Original" /></label>
        <label>Quantity<input name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" /></label>
        <button type="submit">Save line</button>
        <button name="useSuggestedQuantity" value="true" type="submit">Use report quantity</button>
        <button name="intent" value="remove" formNoValidate type="submit">Remove line</button>
      </BillingLineForm>);
    `, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' }
  });
  await page.setContent('<div id="app"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0]!.text });
});

test("failed save preserves entered values and allows retry", async ({ page }) => {
  await page.getByLabel("Description").fill("Edited description");
  await page.getByLabel("Quantity").fill("7");
  await page.getByRole("button", { name: "Save line", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Refresh before saving again");
  await expect(page.getByLabel("Description")).toHaveValue("Edited description");
  await expect(page.getByLabel("Quantity")).toHaveValue("7");
  await page.evaluate("window.fail = false");
  await page.getByRole("button", { name: "Save line", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Billing line saved");
});

test("submitter intent distinguishes suggested quantity and removal", async ({ page }) => {
  await page.evaluate("window.fail = false");
  await page.getByRole("button", { name: "Use report quantity" }).click();
  await expect(page.getByRole("status")).toContainText("Billing line saved");
  expect(await page.evaluate("window.calls[0].useSuggestedQuantity")).toBe("true");
  await page.getByLabel("Description").fill("");
  await page.getByRole("button", { name: "Remove line" }).click();
  await expect(page.getByRole("status")).toContainText("Line removed");
  expect(await page.evaluate("window.removed")).toBe("remove");
});
