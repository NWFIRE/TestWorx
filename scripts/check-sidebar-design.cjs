const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

async function main() {
  const file = "apps/web/src/app/app/app-shell.tsx";
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set(["NavIcon", "NavItem", "SignOutNavItem", "BrandBlock", "NavSection"]);
  const components = source.statements.filter(n => ts.isFunctionDeclaration(n) && names.has(n.name?.text)).map(n => n.getText(source)).join("\n");
  const css = await postcss([tailwind({ content: [file, "apps/web/src/app/app/request-count-badge.tsx"] })]).process("@tailwind base; @tailwind utilities;", { from: undefined });
  const bundle = await build({ stdin: { contents: `
    import React, { useMemo, useState, useId } from "react";
    import { createRoot } from "react-dom/client";
    import { getAppNavItemsForRole, isAppNavItemActive } from "./apps/web/src/app/app/app-nav-config";
    import { RequestCountBadge } from "./apps/web/src/app/app/request-count-badge";
    const SIMPLIFIED_WORKSPACE_NAV_ENABLED = true;
    const DROPDOWN_NAV_GROUPS = new Set(["Work","Billing","Customers","Operations","Settings"]);
    function Link({children,prefetch,onClick,onPointerEnter,onFocus,...props}) { return <a {...props} onClick={e=>{e.preventDefault();onClick?.(e)}}>{children}</a> }
    function Image({src,alt}) {return <img src={src} alt={alt} style={{width:44,height:44,objectFit:"contain"}}/>}
    ${components}
    window.navigated = []; window.signedOut = 0;
    function App({role="office_admin",collapsed=false}) {
      const items = getAppNavItemsForRole(role).map(item => ({...item,badgeCount:item.href.includes("service-requests")?4:0}));
      return <aside style={{width:collapsed?72:256,height:"100vh",background:"white",display:"flex",flexDirection:"column",borderRight:"1px solid #e2e8f0"}}>
        <header style={{padding:collapsed?"16px 8px":"48px 24px 24px",flexShrink:0}}><BrandBlock collapsed={collapsed}/></header>
        <NavSection collapsed={collapsed} compact={false} navItems={items} pathname="/app/admin/inspections" onNavigate={href=>window.navigated.push(href)} signOutAction={async()=>{window.signedOut++}}/>
      </aside>;
    }
    const root=createRoot(document.getElementById("app"));
    window.mount=(role="office_admin",collapsed=false)=>root.render(<App key={role+collapsed} role={role} collapsed={collapsed}/>);
    window.mount();
  `, loader: "tsx", resolveDir: path.resolve(__dirname,"..") }, bundle: true, write: false, jsx: "automatic", alias: {"@testworx/lib":path.resolve("packages/lib/src/permissions.ts")}, define: {"process.env":'{"NODE_ENV":"production"}'} });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({viewport:{width:1000,height:900}});
    const errors=[]; page.on("pageerror", e=>errors.push(e.message));
    await page.route("http://localhost/**", route=>route.request().url().endsWith("/icon.png")
      ? route.fulfill({contentType:"image/png",body:fs.readFileSync("apps/web/src/app/icon.png")})
      : route.fulfill({contentType:"text/html",body:'<body style="background:#f1f5f9"><div id="app"></div></body>'}));
    await page.goto("http://localhost/test");
    await page.addStyleTag({content:css.css}); await page.addScriptTag({content:bundle.outputFiles[0].text});
    const work=page.getByRole("button",{name:/^Work/});
    await work.waitFor({timeout:5000}).catch(async error=>{console.error(errors,await page.locator("body").innerText());throw error}); assert.equal(await work.getAttribute("aria-expanded"),"true");
    assert.equal(await page.getByRole("link",{name:"Inspections",exact:true}).getAttribute("aria-current"),"page");
    await page.getByRole("button",{name:"Billing",exact:true}).click();
    assert.equal(await work.getAttribute("aria-expanded"),"false");
    assert.equal(await work.locator('[aria-label="4 service requests awaiting review"]').count(),1);
    assert.equal(await work.evaluate(el=>document.getElementById(el.getAttribute("aria-controls")).inert),true);
    assert.equal(await page.getByRole("link",{name:"Inspections",exact:true}).count(),0,"Closed groups must be inaccessible");
    await page.getByRole("link",{name:"Quotes",exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.navigated),["/app/admin/quotes"]);
    await page.getByRole("button",{name:"Settings",exact:true}).click();
    await page.getByRole("button",{name:"Sign out",exact:true}).click();
    await page.waitForFunction(()=>window.signedOut===1);
    await work.click(); await work.click();
    assert.equal(await work.getAttribute("aria-expanded"),"false");
    await work.focus(); await page.keyboard.press("Enter");
    assert.equal(await work.getAttribute("aria-expanded"),"true");
    await page.waitForTimeout(300);
    await page.screenshot({path:"outputs/sidebar-expanded.png"});
    await page.evaluate(()=>window.mount("office_admin",true));
    await page.getByRole("link",{name:"Inspections",exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Work",exact:true}).count(),0);
    assert.equal(await page.getByRole("link",{name:"Inspections",exact:true}).getAttribute("title"),"Inspections");
    await page.setViewportSize({width:390,height:700});
    await page.evaluate(()=>window.mount("office_admin",false)); await work.waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.waitForTimeout(300);
    await page.screenshot({path:"outputs/sidebar-narrow.png"});
    await page.evaluate(()=>window.mount("customer_user",false));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('a[href="/app/admin/inspections"]').count(),0);
    assert.deepEqual(errors,[]);
    console.log("PASS: accordion exclusivity, keyboard access, hidden links, active state, navigation, sign out, collapsed tooltips, narrow sizing, and customer role isolation.");
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
