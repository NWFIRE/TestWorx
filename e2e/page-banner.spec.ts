import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const css = readFileSync("apps/web/src/app/app/page-banner.module.css", "utf8");
for (const width of [390, 800, 1440]) {
  test(`shared page headers preserve readable actions at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.setContent(`<style>
      * {box-sizing:border-box} body {margin:0;padding:20px;background:#eaf0f7;font:14px sans-serif;color:#142238}
      section {padding:20px;margin-bottom:20px} h1,p {margin:0 0 12px} .actions {display:flex;flex-wrap:wrap;gap:8px}
      button,input {min-height:44px;max-width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#142238}
      ${css}
      </style>${["Inspections", "Manuals", "Scheduler", "Billing detail", "Settings"].map(title => `<section class="banner"><p class="muted">Workspace</p><h1>${title}</h1><p class="muted">Northwest Regional Medical Center and Specialty Services</p><div class="actions"><input aria-label="${title} search" /><button type="button">Open ${title}</button></div></section>`).join("")}`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const heading of await page.getByRole("heading").all()) {
      await expect(heading).toHaveCSS("color", "rgb(255, 255, 255)");
    }
    await page.getByRole("textbox", { name: "Scheduler search" }).fill("Customer");
    await page.getByRole("button", { name: "Open Scheduler" }).click();
    await expect(page.getByRole("button", { name: "Open Scheduler" })).toBeFocused();
    await page.screenshot({ path: test.info().outputPath(`headers-${width}.png`), fullPage: true });
  });
}
