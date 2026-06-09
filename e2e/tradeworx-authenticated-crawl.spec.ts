import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const resultRoot = path.join(process.cwd(), "crawl-results");
const screenshotRoot = path.join(resultRoot, "screenshots");

type CrawlRole = "admin" | "tech";
type ViewportName = "desktop" | "mobile";

type CrawlFinding = {
  role: CrawlRole;
  viewport: ViewportName;
  pageName: string;
  url: string;
  message: string;
};

type PageAuditResult = {
  role: CrawlRole;
  viewport: ViewportName;
  pageName: string;
  path: string;
  finalUrl: string;
  loadMs: number;
  screenshotPath: string;
};

const adminPages: Array<{ name: string; path: string; searchable?: boolean }> = [
  { name: "Dashboard", path: "/app/admin/dashboard" },
  { name: "Inspections", path: "/app/admin/inspections", searchable: true },
  { name: "Billing", path: "/app/admin/billing", searchable: true },
  { name: "Quotes", path: "/app/admin/quotes", searchable: true },
  { name: "Deficiencies", path: "/app/deficiencies", searchable: true },
  { name: "Upcoming", path: "/app/admin/upcoming-inspections", searchable: true },
  { name: "Archive", path: "/app/admin/archive", searchable: true },
  { name: "Clients", path: "/app/admin/clients", searchable: true },
  { name: "Parts Services", path: "/app/admin/parts-and-services", searchable: true },
  { name: "Manuals", path: "/app/admin/manuals", searchable: true },
  { name: "Team", path: "/app/admin/team", searchable: true },
  { name: "Settings", path: "/app/admin/settings" },
  { name: "Timesheets", path: "/app/admin/timesheets" }
];

const techPages: Array<{ name: string; path: string; searchable?: boolean }> = [
  { name: "Technician Home", path: "/app/tech" },
  { name: "Technician Work", path: "/app/tech/work", searchable: true },
  { name: "Technician Inspections", path: "/app/tech/inspections", searchable: true },
  { name: "Technician Manuals", path: "/app/manuals", searchable: true },
  { name: "Technician Profile", path: "/app/tech/profile" },
  { name: "Technician Timesheets", path: "/app/tech/timesheets" }
];

const requiredEnv = [
  "TRADEWORX_BASE_URL",
  "TRADEWORX_ADMIN_EMAIL",
  "TRADEWORX_ADMIN_PASSWORD",
  "TRADEWORX_TECH_EMAIL",
  "TRADEWORX_TECH_PASSWORD"
] as const;

function ensureResultDirs() {
  fs.mkdirSync(screenshotRoot, { recursive: true });
}

function writeMarkdown(fileName: string, content: string) {
  ensureResultDirs();
  fs.writeFileSync(path.join(resultRoot, fileName), content, "utf8");
}

function appendMarkdown(fileName: string, content: string) {
  ensureResultDirs();
  fs.appendFileSync(path.join(resultRoot, fileName), content, "utf8");
}

function missingEnvVars() {
  return requiredEnv.filter((key) => !process.env[key]?.trim());
}

function safeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "page";
}

function isInternalUrl(url: string) {
  const baseUrl = process.env.TRADEWORX_BASE_URL;
  if (!baseUrl) {
    return false;
  }
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

function isExpectedNonPageRequest(url: string) {
  return (
    url.includes("/_next/static/") ||
    url.includes("/favicon") ||
    url.includes("/icon") ||
    url.includes("/apple-icon") ||
    url.includes("/manifest.webmanifest")
  );
}

function initializeBlockedReport() {
  const missing = missingEnvVars();
  if (missing.length === 0) {
    return;
  }

  const message = [
    "# TradeWorx Crawl Blocked",
    "",
    "The authenticated Playwright crawl was not run because required environment variables are missing.",
    "",
    "Missing variables:",
    ...missing.map((key) => `- ${key}`),
    "",
    "No credentials were hardcoded. Set the required variables and run:",
    "",
    "```powershell",
    "npm run crawl:app",
    "```",
    ""
  ].join("\n");

  writeMarkdown("bug-report.md", message);
  writeMarkdown("console-errors.md", "# Console Errors\n\nCrawl not run because required environment variables are missing.\n");
  writeMarkdown("network-errors.md", "# Network Errors\n\nCrawl not run because required environment variables are missing.\n");
  writeMarkdown("ux-issues.md", "# UX Issues\n\nCrawl not run because required environment variables are missing.\n");
  writeMarkdown("fixes-applied.md", "# Fixes Applied\n\nNo crawl-derived fixes were applied because the authenticated crawl could not run without credentials.\n");
}

function initializeResultFiles() {
  writeMarkdown("console-errors.md", "# Console Errors\n\n");
  writeMarkdown("network-errors.md", "# Network Errors\n\n");
  writeMarkdown("ux-issues.md", "# UX Issues\n\n");
  writeMarkdown("bug-report.md", "# TradeWorx Authenticated Crawl Bug Report\n\n");
  writeMarkdown("fixes-applied.md", "# Fixes Applied\n\n");
}

async function login(page: Page, role: CrawlRole) {
  const email = process.env[role === "admin" ? "TRADEWORX_ADMIN_EMAIL" : "TRADEWORX_TECH_EMAIL"];
  const password = process.env[role === "admin" ? "TRADEWORX_ADMIN_PASSWORD" : "TRADEWORX_TECH_PASSWORD"];

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/work email/i).fill(email ?? "");
  await page.getByLabel(/password/i).fill(password ?? "");
  await Promise.all([
    page.waitForURL(/\/app(\/|$)/, { timeout: 30_000 }),
    page.getByRole("button", { name: /sign in/i }).click()
  ]);
}

async function prepareContext(context: BrowserContext, role: CrawlRole, viewport: ViewportName, testInfo: TestInfo) {
  const consoleFindings: CrawlFinding[] = [];
  const networkFindings: CrawlFinding[] = [];
  let currentPageName = "login";

  context.on("page", async (newPage) => {
    networkFindings.push({
      role,
      viewport,
      pageName: currentPageName,
      url: newPage.url(),
      message: "A new browser tab/window was opened during crawl."
    });
    await newPage.close().catch(() => undefined);
  });

  const page = await context.newPage();

  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }
    consoleFindings.push({
      role,
      viewport,
      pageName: currentPageName,
      url: page.url(),
      message: message.text()
    });
  });

  page.on("pageerror", (error) => {
    consoleFindings.push({
      role,
      viewport,
      pageName: currentPageName,
      url: page.url(),
      message: `Unhandled page error: ${error.message}`
    });
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!isInternalUrl(url) || isExpectedNonPageRequest(url)) {
      return;
    }
    networkFindings.push({
      role,
      viewport,
      pageName: currentPageName,
      url,
      message: `Request failed: ${request.failure()?.errorText ?? "unknown"}`
    });
  });

  page.on("response", (response) => {
    const url = response.url();
    if (!isInternalUrl(url) || isExpectedNonPageRequest(url)) {
      return;
    }
    const status = response.status();
    if (status >= 400) {
      networkFindings.push({
        role,
        viewport,
        pageName: currentPageName,
        url,
        message: `HTTP ${status} ${response.statusText()}`
      });
    }
  });

  await testInfo.attach(`${role}-${viewport}-audit-target`, {
    body: `${process.env.TRADEWORX_BASE_URL}`,
    contentType: "text/plain"
  });

  return {
    page,
    setCurrentPageName(value: string) {
      currentPageName = value;
    },
    consoleFindings,
    networkFindings
  };
}

async function auditSearchStability(page: Page, result: PageAuditResult, findings: CrawlFinding[]) {
  const input = page.getByRole("textbox").first();
  if (!(await input.count())) {
    return;
  }

  const beforeUrl = page.url();
  await input.fill("");
  await input.fill("test");
  await page.waitForTimeout(550);
  const value = await input.inputValue().catch(() => "");
  if (value !== "test") {
    findings.push({
      role: result.role,
      viewport: result.viewport,
      pageName: result.pageName,
      url: beforeUrl,
      message: `Search input did not preserve typed value. Expected "test", received "${value}".`
    });
  }
  await page.keyboard.press("Escape").catch(() => undefined);
}

async function auditLayout(page: Page, result: PageAuditResult, findings: CrawlFinding[]) {
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth
  }));

  const overflow = Math.max(metrics.documentWidth, metrics.bodyWidth) - metrics.viewportWidth;
  if (overflow > 6) {
    findings.push({
      role: result.role,
      viewport: result.viewport,
      pageName: result.pageName,
      url: result.finalUrl,
      message: `Horizontal overflow detected: ${overflow}px beyond viewport.`
    });
  }
}

async function auditCenteredModal(page: Page, result: PageAuditResult, findings: CrawlFinding[]) {
  const modal = page.locator('[role="dialog"], [aria-modal="true"]').first();
  if (!(await modal.count())) {
    return;
  }
  const box = await modal.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) {
    return;
  }
  const modalCenterY = box.y + box.height / 2;
  const viewportCenterY = viewport.height / 2;
  if (Math.abs(modalCenterY - viewportCenterY) > Math.max(120, viewport.height * 0.25)) {
    findings.push({
      role: result.role,
      viewport: result.viewport,
      pageName: result.pageName,
      url: result.finalUrl,
      message: "Modal/dialog appears significantly off-center in the viewport."
    });
  }
}

async function openSafeModalIfAvailable(page: Page, pageName: string) {
  const safeButtons = [
    /create inspection/i,
    /add report/i,
    /open item mappings/i,
    /open labor rates/i,
    /open minimum pricing/i,
    /open service fee rules/i,
    /open reminder settings/i
  ];

  for (const pattern of safeButtons) {
    const button = page.getByRole("button", { name: pattern }).first();
    const link = page.getByRole("link", { name: pattern }).first();
    if (await button.count()) {
      await button.click().catch(() => undefined);
      await page.waitForTimeout(300);
      return;
    }
    if (pageName !== "Billing" && await link.count()) {
      await link.click().catch(() => undefined);
      await page.waitForTimeout(300);
      return;
    }
  }
}

async function auditPage(page: Page, role: CrawlRole, viewport: ViewportName, pageName: string, targetPath: string, searchable: boolean, setCurrentPageName: (value: string) => void) {
  setCurrentPageName(pageName);
  const started = Date.now();
  await page.goto(targetPath, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  const loadMs = Date.now() - started;

  await expect(page.locator("body")).toBeVisible();

  const screenshotPath = path.join(screenshotRoot, `${safeName(role)}-${safeName(viewport)}-${safeName(pageName)}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const result: PageAuditResult = {
    role,
    viewport,
    pageName,
    path: targetPath,
    finalUrl: page.url(),
    loadMs,
    screenshotPath: path.relative(process.cwd(), screenshotPath).replaceAll("\\", "/")
  };

  const uxFindings: CrawlFinding[] = [];
  await auditLayout(page, result, uxFindings);
  if (searchable) {
    await auditSearchStability(page, result, uxFindings);
  }
  await openSafeModalIfAvailable(page, pageName);
  await auditCenteredModal(page, result, uxFindings);
  await page.keyboard.press("Escape").catch(() => undefined);

  return { result, uxFindings };
}

function writeRoleResults(input: {
  role: CrawlRole;
  viewport: ViewportName;
  results: PageAuditResult[];
  consoleFindings: CrawlFinding[];
  networkFindings: CrawlFinding[];
  uxFindings: CrawlFinding[];
}) {
  appendMarkdown("bug-report.md", [
    `## ${input.role} / ${input.viewport}`,
    "",
    "| Page | Load ms | Final URL | Screenshot |",
    "| --- | ---: | --- | --- |",
    ...input.results.map((result) => `| ${result.pageName} | ${result.loadMs} | ${result.finalUrl} | ${result.screenshotPath} |`),
    ""
  ].join("\n"));

  const writeFindings = (fileName: string, title: string, findings: CrawlFinding[]) => {
    appendMarkdown(fileName, [
      `## ${title}: ${input.role} / ${input.viewport}`,
      "",
      findings.length === 0
        ? "No findings recorded."
        : findings.map((finding) => `- **${finding.pageName}** (${finding.url}): ${finding.message}`).join("\n"),
      ""
    ].join("\n"));
  };

  writeFindings("console-errors.md", "Console", input.consoleFindings);
  writeFindings("network-errors.md", "Network", input.networkFindings);
  writeFindings("ux-issues.md", "UX", input.uxFindings);
}

async function crawlRole(context: BrowserContext, role: CrawlRole, viewport: ViewportName, testInfo: TestInfo) {
  const audit = await prepareContext(context, role, viewport, testInfo);
  const { page, setCurrentPageName, consoleFindings, networkFindings } = audit;
  const results: PageAuditResult[] = [];
  const uxFindings: CrawlFinding[] = [];

  await login(page, role);
  const pages = role === "admin" ? adminPages : techPages;
  for (const pageTarget of pages) {
    const pageResult = await auditPage(page, role, viewport, pageTarget.name, pageTarget.path, Boolean(pageTarget.searchable), setCurrentPageName);
    results.push(pageResult.result);
    uxFindings.push(...pageResult.uxFindings);
  }

  writeRoleResults({ role, viewport, results, consoleFindings, networkFindings, uxFindings });

  expect(consoleFindings, `${role}/${viewport} console findings`).toEqual([]);
  expect(networkFindings, `${role}/${viewport} network findings`).toEqual([]);
}

initializeBlockedReport();

test.describe("TradeWorx authenticated crawl", () => {
  test.beforeAll(() => {
    ensureResultDirs();
    if (missingEnvVars().length === 0) {
      initializeResultFiles();
    }
  });

  test.skip(missingEnvVars().length > 0, "Required TradeWorx crawl environment variables are missing.");

  test("admin desktop crawl", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await crawlRole(context, "admin", "desktop", testInfo);
    await context.close();
  });

  test("admin mobile crawl", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true });
    await crawlRole(context, "admin", "mobile", testInfo);
    await context.close();
  });

  test("technician desktop crawl", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await crawlRole(context, "tech", "desktop", testInfo);
    await context.close();
  });

  test("technician mobile crawl", async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true });
    await crawlRole(context, "tech", "mobile", testInfo);
    await context.close();
  });
});
