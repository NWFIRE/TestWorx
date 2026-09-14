import { expect, test } from "@playwright/test";

test.describe("Public marketing homepage", () => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    test(`fits a ${width}px viewport without horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Exceptional service\.\s*Connected teams\./);
      await expect(page.getByAltText("Field technician using a tablet beside a fire alarm control panel")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const id of ["product", "features", "pricing", "final-cta", "footer-contact"]) {
        await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
      }
    });
  }

  test("mobile navigation opens, closes with Escape, and follows section links", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Open navigation" });
    const navigation = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(navigation).toBeHidden();
    await toggle.click();
    await expect(navigation).toBeVisible();
    await page.getByRole("button", { name: "Close navigation" }).press("Escape");
    await expect(navigation).toBeHidden();
    await expect(toggle).toBeFocused();
    await toggle.click();
    await navigation.getByRole("link", { name: "Features", exact: true }).click();
    await expect(navigation).toBeHidden();
    await expect(page).toHaveURL(/#features$/);
    await expect(page.getByRole("link", { name: "Sign in", exact: true }).first()).toHaveAttribute("href", "/login");
  });
});
