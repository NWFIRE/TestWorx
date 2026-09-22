const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

async function main() {
  const settingsSource=fs.readFileSync("apps/web/src/app/app/admin/settings/page.tsx","utf8");
  assert.doesNotMatch(settingsSource,/Stripe env vars|STRIPE_WEBHOOK_SECRET|Webhook sync:|Advanced recurrence:|Uploaded inspection PDFs:/);
  assert.match(settingsSource,/isSectionOpen\(params, "quickbooksOpen", quickBooksNotice\)/);
  const css = await postcss([tailwind({content:["apps/web/src/app/app/admin/settings/*.tsx"]})]).process("@tailwind base; @tailwind utilities;",{from:undefined});
  const bundle = await build({stdin:{contents:`
    import React from "react"; import {createRoot} from "react-dom/client";
    import {SettingsSidePanel} from "./apps/web/src/app/app/admin/settings/settings-side-panel";
    import {SettingsDisclosureCard} from "./apps/web/src/app/app/admin/settings/settings-disclosure-card";
    import {TenantBrandingForm} from "./apps/web/src/app/app/admin/settings/tenant-branding-form";
    import {SidebarOrderForm} from "./apps/web/src/app/app/admin/settings/sidebar-order-form";
    import {MinimumTicketPricingSettingsCard} from "./apps/web/src/app/app/admin/settings/minimum-ticket-pricing-settings-card";
    import {QuickBooksSettingsCard} from "./apps/web/src/app/app/admin/settings/quickbooks-settings-card";
    window.saved=[];
    const save=async(_,fd)=>{window.saved.push(Object.fromEntries(fd));return {error:null,success:"Saved"}};
    const values={logoDataUrl:"",primaryColor:"#123456",accentColor:"#123456",legalBusinessName:"Northwest Fire & Safety",billingEmail:"accounting@example.com",email:"office@example.com",phone:"580-540-3119",website:"https://example.com",addressLine1:"2517 N. Van Buren",addressLine2:"",city:"Enid",state:"OK",postalCode:"73703",timezone:"America/Chicago"};
    const rules=[{id:"one",name:"Enid Local Minimum",ruleType:"local_service",amount:59,currency:"USD",appliesTo:"all",locationMode:"city",city:"Enid",state:"OK",priority:50,isActive:true}];
    createRoot(document.getElementById("app")).render(<main className="p-4 sm:p-6"><div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <aside className="min-w-0 rounded-2xl border bg-white p-2 xl:col-start-2 xl:row-start-1">
        <SettingsSidePanel title="Tenant branding" description="Logo, colors, and business details"><TenantBrandingForm values={values}/></SettingsSidePanel>
        <SettingsSidePanel title="Sidebar order" description="Arrange navigation sections"><SidebarOrderForm items={[{href:"/one",label:"One"},{href:"/two",label:"Two"}]} savedOrder={[]} updateAction={save}/></SettingsSidePanel>
      </aside>
      <div className="min-w-0 space-y-4 xl:col-start-1 xl:row-start-1"><SettingsDisclosureCard eyebrow="Minimum ticket pricing" title="Location-based minimums" openLabel="Open minimum pricing" initialOpen><MinimumTicketPricingSettingsCard rules={rules} upsertRuleAction={save} deleteRuleAction={async()=>{}}/></SettingsDisclosureCard>
      <SettingsDisclosureCard eyebrow="Integrations" title="QuickBooks Online" openLabel="Manage connection"><QuickBooksSettingsCard connected configured companyName="Test company" realmId="123" connectedAt={null} appConnectionMode="live" appConnectionModeLabel="Live" storedConnectionMode="live" storedConnectionModeLabel="Live" modeMismatch={false} reconnectRequired={false} statusLabel="Connected" guidance={null} hasStoredConnection connectAction={async()=>{}} disconnectAction={async()=>{}} syncCustomersAction={save} importCustomersAction={async()=>{}} importCatalogAction={async()=>{}}/></SettingsDisclosureCard></div>
    </div></main>);
  `,loader:"tsx",resolveDir:path.resolve(__dirname,"..")},bundle:true,write:false,jsx:"automatic",alias:{"@testworx/lib":path.resolve("packages/lib/src/timezone.ts")},define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"next-test",setup(b){
    b.onResolve({filter:/^next\/(navigation|image)$/},args=>({path:args.path,namespace:"test"}));
    b.onLoad({filter:/.*/,namespace:"test"},args=>({contents:args.path.endsWith("image")?'export default function Image(){return null}':'export const useRouter=()=>({refresh(){}}); export const usePathname=()=>"/settings"; export const useSearchParams=()=>new URLSearchParams();'}));
  }}]});
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage(); const errors=[]; page.on("pageerror",e=>errors.push(e.message));
    let brandingBody="";
    await page.route("http://localhost/**",route=>{
      if(route.request().url().endsWith("/api/admin/settings/branding")) {
        brandingBody=route.request().postData()??"";
        return route.fulfill({contentType:"application/json",body:JSON.stringify({success:"Branding updated."})});
      }
      return route.fulfill({contentType:"text/html",body:'<div id="app"></div>'});
    });
    await page.goto("http://localhost/settings"); await page.addStyleTag({content:css.css+' @media(min-width:1024px){main{margin-left:256px}} body{background:#f1f5f9}'}); await page.addScriptTag({content:bundle.outputFiles[0].text});
    for (const width of [320,390,768,1280,1920]) {
      await page.setViewportSize({width,height:900});
      await page.getByRole("button",{name:"Open minimum pricing"}).count();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Page overflow at ${width}`);
      if(width===1280) await page.screenshot({path:"outputs/settings-layout-1280.png",fullPage:true});
      await page.getByRole("button",{name:/^Tenant branding/}).click();
      const dialog=page.getByRole("dialog",{name:"Tenant branding"}); await dialog.waitFor();
      assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true,`Branding overflow at ${width}`);
      if(width===1280) await page.screenshot({path:"outputs/settings-branding-panel.png"});
      await page.getByLabel("Business name",{exact:true}).fill("Edited company");
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("button",{name:/^Tenant branding/}).evaluate(el=>el===document.activeElement),true);
    }
    await page.getByRole("button",{name:/^Tenant branding/}).click();
    assert.equal(await page.getByLabel("Business name",{exact:true}).inputValue(),"Edited company","Closing must retain drafts");
    await page.getByRole("button",{name:"Save branding"}).click();
    await page.getByText("Branding updated.",{exact:true}).waitFor();
    assert.match(brandingBody,/Edited company/);
    assert.match(brandingBody,/America\/Chicago/);
    await page.getByRole("button",{name:"Close Tenant branding"}).click();
    await page.getByRole("button",{name:/^Sidebar order/}).click();
    await page.getByRole("button",{name:"Down",exact:true}).first().click();
    await page.getByRole("button",{name:"Save sidebar order"}).click();
    await page.waitForFunction(()=>saved.length===1);
    assert.equal(await page.evaluate(()=>saved[0].sidebarOrder),'["/two","/one"]');
    await page.getByRole("button",{name:"Close Sidebar order"}).click();
    await page.getByRole("button",{name:"Save minimum rule"}).click(); await page.waitForFunction(()=>saved.length===2);
    assert.equal(await page.evaluate(()=>saved[1].amount),"59");
    await page.getByRole("button",{name:"Hide section"}).click();
    assert.equal(await page.getByRole("button",{name:"Save minimum rule"}).count(),0,"Hidden fields must not be focusable");
    assert.equal(await page.getByRole("button",{name:"Sync Customers",exact:true}).count(),0,"QuickBooks controls start collapsed");
    await page.getByRole("button",{name:"Manage connection"}).click();
    await page.getByRole("button",{name:"Sync Customers",exact:true}).click();
    await page.waitForFunction(()=>saved.length===3);
    assert.equal(await page.getByRole("button",{name:"Disconnect QuickBooks"}).count(),1);
    assert.deepEqual(errors,[]);
    console.log("PASS: 320/390/768/1280/1920 layouts, side panels, Escape/focus restoration, retained drafts, branding save, sidebar reorder/save, rule save, disclosure accessibility.");
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
