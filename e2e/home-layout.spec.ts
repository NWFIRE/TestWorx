import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const css = readFileSync("apps/web/src/app/app/home.module.css", "utf8").replace(/composes:[^;]+;/g, "");

// Presentation fixture uses the shipped stylesheet; no live customer records or mutations.
for (const width of [390, 800, 1024, 1366, 1440, 1920]) {
  test(`Home remains usable at ${width}px and while resizing`, async ({ page }) => {
    await page.setViewportSize({ width, height: 768 });
    await page.setContent(`<style>
      * { box-sizing:border-box } body { margin:0; background:#eaf0f7; font:14px sans-serif; color:#142238 }
      :root { --border-default:#d6e0ed; --surface-base:#fff; --surface-subtle:#f3f6fa; --surface-muted:#edf2f8; --text-secondary:#43546b; --text-muted:#526780; --tenant-primary:#2864a5; --tenant-primary-rgb:40 100 165 }
      main { padding:24px; margin-left:240px } h1,h2,p { margin:0 } a { text-decoration:none; color:inherit } input { width:100%; min-height:44px; border:1px solid #cbd5e1; border-radius:12px; padding:12px }
      .row { display:flex; align-items:center } .label { min-width:0; flex:1 } .row time { flex-shrink:0 } .row > div { min-width:0; flex:1 }
      @media(max-width:900px) { main { margin-left:0; padding:16px } }
      ${css}
      </style><main class="home">
      <header class="welcome"><div><h1>Home</h1><p>Welcome back, Jeremy.</p></div><div class="welcomeTools"><div class="date">Monday, November 23</div><input aria-label="Search" placeholder="Search inspections, reports, customers" /></div></header>
      <div class="grid"><section class="panel" data-home-panel="attention"><div class="panelHeader"><div class="panelTitle"><span class="sectionIcon">01</span><h2>Needs Attention</h2></div></div>
      ${["Unassigned inspections", "Ready to bill", "Payment collection on site", "Linked visit updates"].map((label,i) => `<a class="row" href="#queue"><span class="rowIcon">+</span><span class="label">${label}</span><span class="count">${i+12}</span><span aria-hidden="true">›</span></a>`).join("")}
      <div class="footer"><a href="#inspections">Inspections</a><a href="#reports">Report review</a></div></section>
      <section class="panel" data-home-panel="schedule"><div class="panelHeader"><div class="panelTitle"><span class="sectionIcon">02</span><h2>Today's Schedule</h2></div><a class="scheduleLink" href="#schedule">View schedule</a></div><div class="scheduleBody">
      ${["Northwest Regional Medical Center and Specialty Services", "Harbor Point Center", "A".repeat(90)].map((name,i) => `<a class="row" href="#job"><time>${i+9}:00 AM</time><div><p>${name}</p><p>North entrance / Building 2</p><p>Jordan Williams</p><p class="status">Scheduled</p></div></a>`).join("")}
      </div></section></div></main>`);
    await page.getByRole("textbox", { name: "Search" }).fill("Harbor Point");
    for (const nextWidth of [width, 800, 500, width]) {
      await page.setViewportSize({ width: nextWidth, height: 720 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole("textbox", { name: "Search" })).toHaveValue("Harbor Point");
      const box = await page.getByRole("link", { name: "View schedule" }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(nextWidth);
    }
    await page.getByRole("textbox", { name: "Search" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /Unassigned inspections/ })).toBeFocused();
    await page.screenshot({ path: test.info().outputPath(`home-${width}.png`), fullPage: true });
    await page.locator(".scheduleBody").evaluate(el => { el.innerHTML = '<div class="empty"><span class="emptyIcon">✓</span><p>No jobs scheduled today.</p></div>'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
