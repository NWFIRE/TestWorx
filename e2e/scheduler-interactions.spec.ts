import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";

const job = {id:"visit-1",customer:"Test Customer",site:"Main Site",address:"",types:["fire_alarm"],technicianIds:["tech-1"],scheduledStart:"2026-11-24T15:00:00.000Z",scheduledEnd:"2026-11-24T16:00:00.000Z",updatedAt:"2026-11-24T12:00:00.000Z",status:"to_be_completed",sessions:[]};
let assets: {js:string;css:string};
test.beforeAll(async () => {
  const result = await build({stdin:{loader:"tsx",resolveDir:process.cwd(),contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {SchedulerBoard} from './apps/web/src/app/app/admin/scheduler/scheduler-board';
    createRoot(document.getElementById('app')).render(<SchedulerBoard initial={window.fixture} initialView="day" />);
  `},bundle:true,write:false,outdir:"out",platform:"browser",format:"iife",jsx:"automatic",plugins:[{
    name:"fixture-boundaries",setup(plugin){
      plugin.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"fixture"}));
      plugin.onResolve({filter:/^\.\.\/\.\.\/service-directions$/},()=>({path:"directions",namespace:"fixture"}));
      plugin.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"jsx",resolveDir:process.cwd(),contents:args.path === "link" ? "import React from 'react'; export default function Link(props){return <a {...props}/>;}" : "export function ServiceDirections(){return null;}"}));
    }
  }]});
  assets = {js:result.outputFiles.find(file=>file.path.endsWith('.js'))!.text,css:result.outputFiles.find(file=>file.path.endsWith('.css'))!.text};
});

async function fixture(page:Page, conflict=false, startOnly=false) {
  let current = {...job, scheduledEnd: startOnly ? null : job.scheduledEnd};
  const requests: Record<string,unknown>[] = [];
  const data = () => ({timezone:"America/Chicago",days:["2026-11-24"],fetchedAt:new Date().toISOString(),truncated:false,technicians:[{id:"tech-1",name:"Technician One",isActive:true}],jobs:[current]});
  await page.context().route("https://scheduler.test/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/scheduler") {
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON(); requests.push(payload);
        if (conflict) return route.fulfill({status:409,json:{ok:false,conflicts:[{id:"other",customer:"Other Customer"}]}});
        current = {...current,scheduledEnd:payload.end+":00.000Z",updatedAt:new Date().toISOString()};
        // Input uses company wall time, not UTC.
        current.scheduledEnd = new Date(new Date(payload.end+":00.000Z").getTime()+6*3600000).toISOString();
        return route.fulfill({json:{ok:true,job:current}});
      }
      const result = data();
      if(url.searchParams.get("view")==="week") result.days = ["2026-11-23","2026-11-24","2026-11-25","2026-11-26","2026-11-27","2026-11-28","2026-11-29"];
      return route.fulfill({json:result});
    }
    if(url.pathname.startsWith("/app/admin/inspections/")) return route.fulfill({contentType:"text/html",body:"<h1>Inspection details</h1>"});
    if(url.pathname === "/original") return route.fulfill({contentType:"text/html",body:'<a href="/app/admin/scheduler" target="_blank" rel="opener">Launch schedule</a>'});
    return route.fulfill({contentType:"text/html",body:`<style>body{margin:16px;font:14px Arial}button{cursor:pointer}${assets.css}</style><div id="app"></div><script>window.fixture=${JSON.stringify(data())}</script><script>${assets.js}</script>`});
  });
  await page.setViewportSize({width:1440,height:900});
  return requests;
}

test("Day resize saves only the end; outside click dismisses; keyboard works", async ({page}) => {
  const requests = await fixture(page);
  await page.goto("https://scheduler.test/app/admin/scheduler");
  const handle = page.getByRole("button",{name:"Resize Test Customer",exact:true});
  await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!;
  const timeline = await page.locator('[data-day-minutes]').first().boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+timeline!.width*30/1440,box.y+box.height/2,{steps:6});
  await page.mouse.up();
  await expect(page.getByRole("status").filter({hasText:"Scheduled duration updated"})).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({resizeOnly:true,start:"2026-11-24T09:00",end:"2026-11-24T10:30",technicianIds:["tech-1"],updatedAt:job.updatedAt});
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button",{name:/Test Customer/}).filter({has:page.locator("strong")}).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.mouse.click(100,250);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await handle.focus(); await page.keyboard.press("ArrowRight");
  await expect.poll(()=>requests.length).toBe(2);
  expect(requests[1].end).toBe("2026-11-24T10:45");
  await page.screenshot({path:"output/scheduler-day-updated.png",fullPage:true});
});

test("a saved 9 AM start remains on the timeline without an end time or a resave", async ({page}) => {
  const requests = await fixture(page, false, true);
  await page.goto("https://scheduler.test/app/admin/scheduler");
  const slot = page.locator('[data-scheduled-start="2026-11-24T15:00:00.000Z"]');
  await expect(slot).toHaveCount(1);
  expect(await slot.evaluate(element => element.style.left)).toBe("37.5%");
  await expect(page.getByText("9:00 AM · End not set", {exact:true}).nth(1)).toBeVisible();
  await expect(page.getByText(/Time TBD/)).toHaveCount(0);
  await page.reload();
  await expect(slot).toHaveCount(1);
  expect(requests).toHaveLength(0);
  await page.getByRole("button",{name:"Week",exact:true}).click();
  await expect(page.getByText("9:00 AM · End not set", {exact:true}).first()).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByText("9:00 AM · End not set", {exact:true}).last()).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole("button",{name:"Day",exact:true}).click();
  const handle = page.getByRole("button",{name:"Resize Test Customer",exact:true});
  await handle.focus(); await page.keyboard.press("ArrowRight");
  await expect.poll(()=>requests.length).toBe(1);
  expect(requests[0]).toMatchObject({start:"2026-11-24T09:00",end:"2026-11-24T09:30",resizeOnly:true});
});

test("Week resizing exposes conflicts without silently saving",async({page})=>{
  const requests=await fixture(page,true);
  await page.goto("https://scheduler.test/app/admin/scheduler");
  await page.getByRole("button",{name:"Week",exact:true}).click();
  const handle=page.getByRole("button",{name:"Resize Test Customer",exact:true});
  await expect(handle).toBeVisible();
  const box=(await handle.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2+32,{steps:5});await page.mouse.up();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Overlaps: Other Customer")).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].end).toBe("2026-11-24T10:30");
  page.once("dialog",dialog=>dialog.dismiss());
  await page.mouse.click(100,250);
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog",dialog=>dialog.accept());
  await page.mouse.click(100,250);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("inspection reuses launching tab, then falls back to current tab when it closes",async({page,context})=>{
  await fixture(page);
  await page.goto("https://scheduler.test/original");
  const popupPromise=page.waitForEvent("popup");
  await page.getByText("Launch schedule").click();
  const scheduler=await popupPromise;
  await scheduler.getByRole("button",{name:/Test Customer/}).filter({has:scheduler.locator("strong")}).first().click();
  await scheduler.getByRole("link",{name:"Open inspection",exact:true}).click();
  await expect(page).toHaveURL(/\/app\/admin\/inspections\/visit-1/);
  expect(context.pages()).toHaveLength(2);
  await expect(scheduler).toHaveURL(/\/app\/admin\/scheduler/);
  await page.close();
  await scheduler.getByRole("link",{name:"Open inspection",exact:true}).click();
  await expect(scheduler).toHaveURL(/\/app\/admin\/inspections\/visit-1/);
  expect(context.pages()).toHaveLength(1);
});

test("Escape cancels a drag and narrow layouts retain reachable job details",async({page})=>{
  const requests=await fixture(page);
  const errors:string[]=[]; page.on("pageerror",error=>errors.push(error.message));
  await page.goto("https://scheduler.test/app/admin/scheduler");
  const handle=page.getByRole("button",{name:"Resize Test Customer",exact:true});
  const box=(await handle.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2,{steps:4});
  await page.keyboard.press("Escape");await page.mouse.up();
  expect(requests).toHaveLength(0);
  for(const width of [800,390]) {
    await page.setViewportSize({width,height:720});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole("button",{name:/Test Customer/}).filter({has:page.locator("strong")}).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button",{name:"Close job details"})).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.screenshot({path:`output/scheduler-${width}-updated.png`,fullPage:true});
  }
  expect(errors).toEqual([]);
});
