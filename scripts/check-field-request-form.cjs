const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");

async function main() {
  const bundle = await build({
    stdin: {
      contents: `import React from "react";
        import { createRoot } from "react-dom/client";
        import { FieldRequestForm } from "./apps/web/src/app/app/tech/requests/field-request-form";
        const customers = [{ id: "first", name: "First Customer", sites: [{ id: "first-site", name: "First Site", addressLine1: "1 Main", city: "Enid", state: "OK" }] }, { id: "second", name: "Second Customer", sites: [] }];
        createRoot(document.getElementById("root")).render(<FieldRequestForm customers={customers} />);`,
      resolveDir: path.resolve(__dirname, ".."),
      loader: "tsx"
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    alias: { "@": path.resolve(__dirname, "../apps/web/src") },
    plugins: [{
      name: "mock-request-save",
      setup(builder) {
        builder.onResolve({ filter: /^\.\/actions$/ }, (args) => args.importer.endsWith("field-request-form.tsx") ? { path: "request-save", namespace: "test" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: `export async function submitFieldRequestAction(_, data) {
          window.submissions.push(Object.fromEntries(data));
          await new Promise(resolve => setTimeout(resolve, 100));
          if (window.saveMode === "network") throw new Error("Connection interrupted");
          return window.saveMode === "success" ? { ok: true, message: "Request sent" } : { ok: false, message: "Please correct the details" };
        }` }));
      }
    }]
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("http://localhost/**", (route) => route.fulfill({ contentType: "text/html", body: '<div id="root"></div><script>window.submissions=[];window.saveMode="validation";</script>' }));
    await page.goto("http://localhost/request-test");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const search = page.getByRole("combobox", { name: "Customer", exact: true });
    await search.fill("eNiD");
    await page.getByRole("option", { name: /First Customer/ }).click();
    assert.equal(await page.locator('[name="customerCompanyId"]').inputValue(), "first");
    await page.locator('[name="siteId"]').selectOption("first-site");
    await search.fill("sec");
    assert.equal(await search.inputValue(), "sec", "Editing a selection must preserve the new search text");
    assert.equal(await page.locator('[name="customerCompanyId"]').inputValue(), "");
    await search.press("Enter");
    assert.equal(await page.locator('[name="customerCompanyId"]').inputValue(), "second");
    assert.equal(await page.locator('[name="siteId"]').inputValue(), "");
    assert.equal(await page.locator('[name="siteId"]').isDisabled(), true);
    await page.locator('[name="title"]').fill("Replace pull station");
    await page.locator('[name="description"]').fill("The pull station at the east exit is damaged.");
    await page.getByRole("button", { name: "Clear selection" }).click();
    assert.equal(await search.inputValue(), "");
    await search.fill("no matching customer");
    await page.getByText("No matching customers. Try another name or location.").waitFor();
    await search.press("Escape");
    await page.getByRole("button", { name: "Send to office" }).click();
    await page.getByText("Select a customer from the search results before sending your request.").waitFor();
    assert.equal(await page.evaluate(() => window.submissions.length), 0, "Unselected search text cannot be submitted");
    await search.fill("SECOND");
    await page.getByRole("option", { name: /Second Customer/ }).click();
    await page.getByRole("button", { name: "Send to office" }).click();
    await page.getByText("Please correct the details").waitFor();
    assert.equal(await page.locator('[name="title"]').inputValue(), "Replace pull station");
    await page.evaluate(() => { window.saveMode = "network"; });
    await page.getByRole("button", { name: "Send to office" }).click();
    await page.getByText("Connection interrupted. Your details are still here. Please try again.").waitFor();
    assert.equal(await page.locator('[name="description"]').inputValue(), "The pull station at the east exit is damaged.");
    await page.evaluate(() => { window.saveMode = "success"; document.querySelector("form").requestSubmit(); document.querySelector("form").requestSubmit(); });
    await page.getByText("Request sent").waitFor();
    const submissions = await page.evaluate(() => window.submissions);
    assert.equal(submissions.length, 3, "Rapid double submission must be ignored");
    assert.equal(new Set(submissions.map((item) => item.submissionId)).size, 1, "Retries must preserve the submission ID");
    assert.equal(submissions[0].siteId, undefined, "Disabled optional site is omitted by the browser");
    assert.equal(await page.locator('[name="title"]').inputValue(), "");
    assert.equal(await page.locator('[name="customerCompanyId"]').inputValue(), "");
    assert.equal(await search.inputValue(), "");
    assert.deepEqual(errors, []);
    console.log("Browser smoke checks passed: customer/location search, selection editing, keyboard selection, clear, no matches, required selection, optional site, customer change, failure retention, retry ID, double submission, success reset, and no page errors.");
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
