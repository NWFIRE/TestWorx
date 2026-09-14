import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Isolate the actual billing stylesheet without production billing mutations.
const css = readFileSync(path.join(process.cwd(), "apps/web/src/app/app/admin/billing/[inspectionId]/billing-detail.module.css"), "utf8");

for (const width of [320, 390, 768, 1280, 1536, 1920]) {
  test(`billing density fits ${width}px while preserving editable controls`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.setContent(`
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; font: 14px sans-serif; padding: 16px; }
        p { margin: 0; }
        main { max-width: 1700px; margin: auto; }
        input:not([type=hidden]), button { min-height: 44px; width: 100%; }
        input[type=checkbox] { min-height: 16px; width: 16px; }
        label { display: block; }
        .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .columns { display: grid; gap: 16px; margin-top: 16px; }
        .columns > * { min-width: 0; }
        @media(min-width:1536px) { .columns { grid-template-columns: minmax(0,.95fr) minmax(0,1.05fr); } }
        ${css}
      </style>
      <main class="detail">
        <div class="metrics">${["Labor hours", "Material items", "Billing setup", "QuickBooks invoice"].map(label => `<div><p>${label}</p><p>123456</p></div>`).join("")}</div>
        <div class="columns"><section>
          <h2>Kitchen suppression inspection</h2>
          <form class="lineControls">
            <input type="hidden" name="summaryId" value="fixture" />
            <label>Quantity<input name="quantity" type="number" value="1" /></label>
            <label><input type="checkbox" name="taxable" /> Taxable</label>
            <div class="actions"><button type="button">Save line</button><button type="button">Remove line</button></div>
          </form>
        </section><aside>Report PDF review</aside></div>
      </main>`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const metrics = await page.locator(".metrics").boundingBox();
    expect(metrics!.height).toBeLessThan(width >= 1024 ? 100 : 180);
    await page.getByRole("spinbutton", { name: "Quantity" }).fill("3");
    await expect(page.getByRole("spinbutton", { name: "Quantity" })).toHaveValue("3");
    await page.getByRole("checkbox", { name: "Taxable" }).check();
    for (const button of await page.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: test.info().outputPath(`billing-density-${width}.png`), fullPage: true });
  });
}
