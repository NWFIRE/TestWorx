import { expect, test } from "@playwright/test";

test("all homepage trial/demo links have real request destinations", async ({ page }) => {
  await page.goto("/");
  for (const link of await page.getByRole("link", { name: /start.*trial/i }).all()) {
    await expect(link).toHaveAttribute("href", /^\/start-trial(?:\?plan=(starter|pro))?$/);
  }
  for (const link of await page.getByRole("link", { name: /^(book (a )?demo|demo)$/i }).all()) {
    await expect(link).toHaveAttribute("href", /^\/book-demo(?:\?plan=enterprise)?$/);
  }
  await page.getByRole("link", { name: "Start Free Trial", exact: true }).first().click();
  await expect(page).toHaveURL(/\/start-trial$/);
  await expect(page.getByRole("form", { name: "Free trial request" })).toBeVisible();
});

for (const kind of ["trial", "demo"]) {
  test(`${kind} form carries plan, fits mobile, and confirms a successful submission`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let payload: Record<string, unknown> | undefined;
    await page.route("**/api/marketing/inquiries", async (route) => {
      payload = route.request().postDataJSON();
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(kind === "trial" ? "/start-trial?plan=pro" : "/book-demo?plan=enterprise");
    await expect(page.getByLabel("Interested plan")).toHaveValue(kind === "trial" ? "pro" : "enterprise");
    await page.getByLabel("Your name").fill("Test Visitor");
    await page.getByLabel("Company", { exact: false }).fill("Test Company");
    await page.getByLabel("Email", { exact: false }).fill("test@example.com");
    await page.getByRole("checkbox").check();
    if (kind === "demo") await page.getByLabel("Preferred availability").fill("Friday, Central time");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: kind === "trial" ? "Request my free trial" : "Request a demo" }).click();
    await expect(page.getByRole("heading", { name: /Your .* request is sent/ })).toBeVisible();
    expect(payload?.kind).toBe(kind);
    expect(payload?.consent).toBe(true);
    expect(payload?.requestId).toMatch(/^[a-f0-9-]{36}$/);
    if (kind === "demo") expect(payload?.availability).toBe("Friday, Central time");
  });
}

test("failed delivery preserves details and retry identity without showing false success", async ({ page }) => {
  const ids: string[] = [];
  await page.route("**/api/marketing/inquiries", async (route) => {
    ids.push(route.request().postDataJSON().requestId);
    await route.fulfill({ status: 503, json: { ok: false, error: "Unable to send. Please try again." } });
  });
  await page.goto("/start-trial?plan=unknown");
  await expect(page.getByLabel("Interested plan")).toHaveValue("not_sure");
  await page.getByLabel("Your name").fill("Test Visitor");
  await page.getByLabel("Company", { exact: false }).fill("Test Company");
  await page.getByLabel("Email", { exact: false }).fill("test@example.com");
  await page.getByRole("checkbox").check();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Request my free trial" }).click();
    await expect(page.getByRole("form", { name: "Free trial request" }).getByRole("alert")).toContainText("Please try again");
  }
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  await expect(page.getByLabel("Your name")).toHaveValue("Test Visitor");
  await expect(page.getByRole("heading", { name: /request is sent/ })).toHaveCount(0);
});

test("public endpoint rejects cross-origin and malformed requests without sending email", async ({ request, baseURL }) => {
  const crossOrigin = await request.post("/api/marketing/inquiries", { headers: { origin: "https://untrusted.example" }, data: {} });
  expect(crossOrigin.status()).toBe(403);
  const invalid = await request.post("/api/marketing/inquiries", { headers: { origin: new URL(baseURL!).origin }, data: { kind: "trial" } });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).ok).toBe(false);
});

test("required fields prevent submission and pending requests disable repeat clicks", async ({ page }) => {
  let count = 0;
  let release: (() => void) | undefined;
  const pendingResponse = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/marketing/inquiries", async (route) => {
    count++;
    await pendingResponse;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/start-trial");
  const submit = page.getByRole("button", { name: "Request my free trial" });
  await submit.click();
  expect(count).toBe(0);
  await page.getByLabel("Your name").fill("Test Visitor");
  await page.getByLabel("Company", { exact: false }).fill("Test Company");
  await page.getByLabel("Email", { exact: false }).fill("test@example.com");
  await page.getByRole("checkbox").check();
  await submit.click();
  await expect(page.getByRole("button", { name: "Sending request..." })).toBeDisabled();
  await expect(page.getByLabel("Your name")).toBeDisabled();
  await expect.poll(() => count).toBe(1);
  release?.();
  await expect(page.getByRole("heading", { name: /Your trial request is sent/ })).toBeVisible();
  expect(count).toBe(1);
});
