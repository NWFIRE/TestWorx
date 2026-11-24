import { expect, test, type Page } from "@playwright/test";
import { build } from "esbuild";
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import tailwindConfig from '../apps/web/tailwind.config';

const job = {id:"visit-1",customer:"Test Customer",site:"Main Site",address:"",types:["fire_alarm"],technicianIds:["tech-1"],scheduledStart:"2026-11-24T15:00:00.000Z",scheduledEnd:"2026-11-24T16:00:00.000Z",updatedAt:"2026-11-24T12:00:00.000Z",status:"to_be_completed",sessions:[]};
let assets: {js:string;css:string};
test.beforeAll(async () => {
  const result = await build({stdin:{loader:"tsx",resolveDir:process.cwd(),contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {SchedulerBoard} from './apps/web/src/app/app/admin/scheduler/scheduler-board';
    createRoot(document.getElementById('app')).render(<SchedulerBoard initial={window.fixture} initialView="day" createOptions={{customers:[{id:'customer-1',name:'Test Customer'}],sites:[],technicians:[{id:'tech-1',name:'Technician One'}]}} />);
  `},bundle:true,write:false,outdir:"out",platform:"browser",format:"iife",jsx:"automatic",tsconfig:'apps/web/tsconfig.json',define:{'process.env':'{"NODE_ENV":"production"}',global:'globalThis'},plugins:[{
    name:"fixture-boundaries",setup(plugin){
      plugin.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"fixture"}));
      plugin.onResolve({filter:/^next\/navigation$/},()=>({path:"navigation",namespace:"fixture"}));
      plugin.onResolve({filter:/^\.\.\/actions$/},()=>({path:"actions",namespace:"fixture"}));
      plugin.onResolve({filter:/^@\/app\/toast-provider$/},()=>({path:"toast",namespace:"fixture"}));
      plugin.onResolve({filter:/^\.\.\/\.\.\/service-directions$/},()=>({path:"directions",namespace:"fixture"}));
      plugin.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"jsx",resolveDir:process.cwd(),contents:
        args.path === 'navigation' ? 'const router={push(url){location.assign(url)},refresh(){}}; export const useRouter=()=>router;' :
        args.path === 'actions' ? 'export async function createInspectionAction(_,data){return (await fetch("/fixture/create",{method:"POST",body:data})).json();}' :
        args.path === 'toast' ? 'const toast={showToast(){}}; export const useToast=()=>toast;' :
        args.path === "link" ? "import React from 'react'; export default function Link(props){return <a {...props}/>;}" : "export function ServiceDirections(){return null;}"}));
    }
  }]});
  assets = {js:result.outputFiles.find(file=>file.path.endsWith('.js'))!.text,css:result.outputFiles.find(file=>file.path.endsWith('.css'))!.text};
  assets.css = ':root{--tenant-primary-rgb:47 104 178;--tenant-accent-rgb:47 104 178;}' + (await postcss([tailwind({...tailwindConfig,content:['apps/web/src/app/app/admin/inspection-scheduler-form.tsx','apps/web/src/app/search-select.tsx','apps/web/src/app/app/admin/schedule-*.tsx']})]).process('@tailwind base; @tailwind utilities;',{from:undefined})).css + assets.css;
});

async function fixture(page:Page, conflict=false, startOnly=false, crowded=false) {
  page.on('pageerror',error=>console.error('Scheduler fixture error:',error.message));
  let current = {...job, scheduledEnd: startOnly ? null : job.scheduledEnd};
  const requests: Record<string,unknown>[] = [];
  const data = () => ({timezone:"America/Chicago",days:["2026-11-24"],fetchedAt:new Date().toISOString(),truncated:false,technicians:[{id:"tech-1",name:"Technician One",isActive:true}],jobs:[current,...(crowded ? [{...current,id:"visit-2",customer:"Long customer name for nearby scheduled inspection",scheduledStart:"2026-11-24T15:15:00.000Z",scheduledEnd:"2026-11-24T15:45:00.000Z"}] : [])]});
  await page.context().route("https://scheduler.test/**", async route => {
    const url = new URL(route.request().url());
    if(url.pathname === '/fixture.js') return route.fulfill({contentType:'text/javascript',body:assets.js});
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
    if(url.pathname === "/app/admin/inspections" && url.searchParams.get("create") === "1") return route.fulfill({contentType:"text/html",body:"<h1>Create Inspection</h1>"});
    if(url.pathname.startsWith("/app/admin/inspections/")) return route.fulfill({contentType:"text/html",body:"<h1>Inspection details</h1>"});
    if(url.pathname === "/original") return route.fulfill({contentType:"text/html",body:'<a href="/app/admin/scheduler" target="_blank" rel="opener">Launch schedule</a>'});
    return route.fulfill({contentType:"text/html",body:`<style>body{margin:16px;font:14px Arial}button{cursor:pointer}${assets.css}</style><div id="app"></div><script>window.fixture=${JSON.stringify(data())}</script><script src="/fixture.js"></script>`});
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

test("Day and Week remain separated at desktop and phone widths",async({page})=>{
  await fixture(page);
  await page.goto("https://scheduler.test/app/admin/scheduler");
  for(const width of [1920,1440,800,390]) {
    await page.setViewportSize({width,height:900});
    const day=(await page.getByRole('button',{name:'Day',exact:true}).boundingBox())!;
    const week=(await page.getByRole('button',{name:'Week',exact:true}).boundingBox())!;
    expect(week.x-day.x-day.width).toBeGreaterThanOrEqual(8);
    expect(week.y).toBe(day.y);
    await expect(page.getByRole('link',{name:'Home',exact:true})).toHaveAttribute('href','/app/admin/dashboard');
    const addJob=page.getByRole('button',{name:'Add Job',exact:true});
    await expect(addJob).toBeVisible();
    for(const state of ['default','hover','focus']) {
      if(state==='hover') await addJob.hover();
      if(state==='focus') await addJob.focus();
      const colors=await addJob.evaluate(element=>({text:getComputedStyle(element).color,background:getComputedStyle(element).backgroundColor}));
      expect(colors).toEqual({text:'rgb(255, 255, 255)',background:'rgb(47, 104, 178)'});
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

for (const view of ["day", "week"] as const) {
  test(`${view} resize feedback never shifts the board or scroll position`, async ({page}) => {
    const requests = await fixture(page);
    await page.setViewportSize({width:800,height:720});
    await page.goto("https://scheduler.test/app/admin/scheduler");
    if (view === "week") await page.getByRole("button",{name:"Week",exact:true}).click();
    const board = page.getByLabel(`${view} scheduling board`,{exact:true});
    const handle = page.getByRole("button",{name:"Resize Test Customer",exact:true});
    await handle.scrollIntoViewIfNeeded();
    const snapshot = () => board.evaluate(element => ({top:element.getBoundingClientRect().top,height:element.getBoundingClientRect().height,left:element.scrollLeft,scroll:element.scrollTop,page:window.scrollY}));
    const before = await snapshot();
    const box = (await handle.boundingBox())!;
    const x = box.x+box.width/2, y = box.y+box.height/2;
    await page.mouse.move(x,y); await page.mouse.down();
    await page.mouse.move(x+(view === "day" ? 32 : 0),y+(view === "week" ? 32 : 0),{steps:6});
    await expect(page.getByRole("status").filter({hasText:"New end:"})).toBeVisible();
    expect(await snapshot()).toEqual(before);
    await page.mouse.up();
    await expect(page.getByRole("status").filter({hasText:"Scheduled duration updated"})).toBeVisible();
    expect(await snapshot()).toEqual(before);
    expect(requests).toHaveLength(1);
    const next = (await handle.boundingBox())!;
    await page.mouse.move(next.x+next.width/2,next.y+next.height/2); await page.mouse.down();
    await page.mouse.move(next.x+next.width/2+32,next.y+next.height/2+32,{steps:4});
    await expect(page.getByRole("status").filter({hasText:"New end:"})).toBeVisible();
    expect(await snapshot()).toEqual(before);
    await page.keyboard.press("Escape"); await page.mouse.up();
    await expect(page.getByText(/New end:/)).toHaveCount(0);
    expect(await snapshot()).toEqual(before);
    expect(requests).toHaveLength(1);
  });
}

test("a saved 9 AM start remains on the timeline without an end time or a resave", async ({page}) => {
  const requests = await fixture(page, false, true);
  await page.goto("https://scheduler.test/app/admin/scheduler");
  const slot = page.locator('[data-scheduled-start="2026-11-24T15:00:00.000Z"]');
  await expect(slot).toHaveCount(1);
  expect(await slot.evaluate(element => element.style.left)).toBe("37.5%");
  await expect(slot.locator('button').first()).toHaveAttribute('title', /9:00 AM · End not set/);
  await expect(slot.locator("strong")).toHaveText("Test Customer");
  const timelineWidth = (await page.locator('[data-day-minutes]').first().boundingBox())!.width;
  expect((await slot.boundingBox())!.width).toBeCloseTo(timelineWidth * 15 / 1440, 0);
  await expect(page.getByText("Visit details",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:/Test Customer/}).filter({has:page.locator("strong")})).toHaveCount(1);
  await page.screenshot({path:"output/scheduler-readable-start-only.png",fullPage:true});
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

test("duration selector updates end and preserves duration when start changes",async({page})=>{
  const requests=await fixture(page);
  await page.goto("https://scheduler.test/app/admin/scheduler");
  await page.getByRole("button",{name:/Test Customer/}).filter({has:page.locator("strong")}).first().click();
  await page.getByRole("button",{name:"Reschedule / reassign"}).click();
  await expect(page.getByLabel("Duration (hours)")).toHaveValue("1");
  await page.getByLabel("Duration (hours)").selectOption("1.5");
  await expect(page.getByLabel("End hour",{exact:true})).toHaveValue("10");
  await expect(page.getByLabel("End minute",{exact:true})).toHaveValue("30");
  await page.getByLabel("Start (America/Chicago) hour",{exact:true}).selectOption("11");
  await expect(page.getByLabel("End hour",{exact:true})).toHaveValue("12");
  await expect(page.getByLabel("End AM or PM",{exact:true})).toHaveValue("PM");
  await page.getByRole("button",{name:"Save schedule",exact:true}).click();
  await expect.poll(()=>requests.length).toBe(1);
  expect(requests[0]).toMatchObject({start:"2026-11-24T11:00",end:"2026-11-24T12:30"});
});

test("adjacent short jobs match their time slots without artificial lanes or duplicate cards",async({page})=>{
  await fixture(page,false,true,true);
  await page.goto("https://scheduler.test/app/admin/scheduler");
  for(const width of [1440,800]) {
    await page.setViewportSize({width,height:900});
    const slots=page.locator("[data-scheduled-start]");
    await expect(slots).toHaveCount(2);
    const first=(await slots.nth(0).boundingBox())!,second=(await slots.nth(1).boundingBox())!;
    const timeline=(await page.locator('[data-day-minutes]').first().boundingBox())!;
    expect(first.width).toBeCloseTo(timeline.width*15/1440,0);
    expect(second.width).toBeCloseTo(timeline.width*30/1440,0);
    expect(second.y).toBe(first.y);
    expect(second.x).toBeCloseTo(first.x+first.width,0);
    await expect(page.getByText("Visit details",{exact:true})).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const board=page.getByLabel("day scheduling board",{exact:true});
    await board.evaluate(element=>{element.scrollLeft=700;});
    const name=page.getByText("Technician One",{exact:true}).first();
    const nameBox=(await name.boundingBox())!;
    expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.textContent?.includes("Technician One"),{x:nameBox.x+5,y:nameBox.y+5})).toBe(true);
    await board.evaluate(element=>{element.scrollLeft=0;});
  }
  await page.getByLabel("day scheduling board",{exact:true}).evaluate(element=>{element.scrollLeft=500;});
  await expect(page.locator("[data-scheduled-start]").nth(1)).toBeInViewport();
  await page.screenshot({path:"output/scheduler-readable-crowded.png",fullPage:true});
});

test("timeline widths track saved duration and live resizing while overlaps retain separate lanes",async({page})=>{
  await fixture(page,false,false,true);
  await page.goto("https://scheduler.test/app/admin/scheduler");
  const slots=page.locator('[data-scheduled-start]');
  const timeline=(await page.locator('[data-day-minutes]').first().boundingBox())!;
  const first=(await slots.nth(0).boundingBox())!, second=(await slots.nth(1).boundingBox())!;
  expect(first.width).toBeCloseTo(timeline.width*60/1440,0);
  expect(second.y).toBeGreaterThanOrEqual(first.y+first.height);
  expect(await slots.nth(0).locator('strong').evaluate(element=>getComputedStyle(element).fontSize)).toBe('10px');
  const handle=page.getByRole('button',{name:'Resize Test Customer',exact:true});
  const box=(await handle.boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y); await page.mouse.down();
  await page.mouse.move(x+timeline.width*30/1440,y,{steps:6});
  await expect(page.getByRole('status').filter({hasText:'New end:'})).toBeVisible();
  const preview=(await slots.nth(0).boundingBox())!;
  expect(preview.x).toBe(first.x);
  expect(preview.width).toBeCloseTo(timeline.width*90/1440,0);
  await page.mouse.up();
  await expect(page.getByRole('status').filter({hasText:'Scheduled duration updated'})).toBeVisible();
  expect((await slots.nth(0).boundingBox())!.width).toBeCloseTo(timeline.width*90/1440,0);
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

async function fillJob(page: Page) {
  await page.getByRole('button',{name:'Add Job',exact:true}).click();
  await page.getByPlaceholder('Search customers').fill('Test');
  await page.getByRole('option',{name:'Test Customer',exact:true}).click();
}

test('Add Job creates in a popup, closes on success, and preserves Scheduler date and view',async({page,context})=>{
  await fixture(page);
  let submissions=0;
  await page.route('**/fixture/create',async route=>{
    submissions++;
    expect(route.request().postData()).toContain('2026-11-24T09:00');
    await route.fulfill({json:{error:null,success:'Inspection created.',createdInspectionId:'new-job'}});
  });
  await page.goto('https://scheduler.test/app/admin/scheduler');
  await page.getByRole('button',{name:'Week',exact:true}).click();
  const url=page.url();
  await fillJob(page);
  await expect(page.getByLabel('Inspection date',{exact:true})).toHaveValue('2026-11-24');
  const refresh=page.waitForRequest(request=>request.url().includes('/api/admin/scheduler?'));
  await page.getByRole('button',{name:'Create inspection',exact:true}).click();
  await refresh;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('button',{name:'Week',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'Add Job',exact:true})).toBeFocused();
  expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
  expect(submissions).toBe(1);
  expect(context.pages()).toHaveLength(1);
});

test('creation errors preserve the popup and entered values; saving blocks dismissal',async({page})=>{
  await fixture(page);
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/fixture/create',async route=>{
    await pending;
    await route.fulfill({json:{error:'Please try again.',success:null}});
  });
  await page.goto('https://scheduler.test/app/admin/scheduler');
  await fillJob(page);
  const request=page.waitForRequest('**/fixture/create');
  await page.getByRole('button',{name:'Create inspection',exact:true}).click();
  await request;
  await expect(page.getByRole('button',{name:'Close',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  release();
  await expect(page.getByRole('button',{name:'Create inspection',exact:true})).toBeEnabled();
  await expect(page.getByPlaceholder('Search customers')).toHaveValue('Test Customer');
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('creation popup fits short and mobile windows without losing entered values',async({page})=>{
  await fixture(page);
  await page.goto('https://scheduler.test/app/admin/scheduler');
  await fillJob(page);
  for(const size of [{width:1440,height:720},{width:800,height:500},{width:390,height:844}]) {
    await page.setViewportSize(size);
    const dialog=page.getByRole('dialog');
    const box=(await dialog.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(size.width);expect(box.y+box.height).toBeLessThanOrEqual(size.height);
    await expect(page.getByPlaceholder('Search customers')).toHaveValue('Test Customer');
    await page.getByRole('button',{name:'Create inspection',exact:true}).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button',{name:'Create inspection',exact:true})).toBeInViewport();
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await page.screenshot({path:test.info().outputPath(`create-popup-${size.width}.png`)});
  }
});

for(const uploadFails of [false,true]) test(`creation waits for PDF uploads and handles failure=${uploadFails} without navigating`,async({page})=>{
  await fixture(page);
  let submissions=0;
  await page.route('**/fixture/create',route=>{submissions++;return route.fulfill({json:{error:null,success:'Inspection created.',createdInspectionId:'new-job'}});});
  let release!:()=>void;
  const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/inspections/new-job/documents/upload',async route=>{
    await pending;
    await route.fulfill({status:uploadFails?500:200,json:uploadFails?{error:'Upload unavailable.'}:{success:'Uploaded'}});
  });
  await page.goto('https://scheduler.test/app/admin/scheduler');
  await fillJob(page);
  await page.locator('#externalDocuments').setInputFiles({name:'report.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nfixture')});
  const uploading=page.waitForRequest('**/api/inspections/new-job/documents/upload');
  await page.getByRole('button',{name:'Create inspection',exact:true}).click();
  await uploading;
  await expect(page.getByRole('button',{name:'Close',exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  release();
  if(uploadFails) {
    await expect(page.getByRole('alert')).toContainText('Inspection created; PDFs need attention');
    await expect(page.getByRole('link',{name:'Open created inspection'})).toHaveAttribute('href','/app/admin/inspections/new-job');
    await expect(page.getByRole('button',{name:'Create inspection',exact:true})).toHaveCount(0);
    await page.getByRole('button',{name:'Close',exact:true}).click();
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL('https://scheduler.test/app/admin/scheduler');
  expect(submissions).toBe(1);
});

test('duplicate review remains inside creation and adding to an existing inspection does not navigate',async({page})=>{
  await fixture(page);
  let submissions=0;
  await page.route('**/fixture/create',route=>{
    submissions++;
    if(submissions===3) expect(route.request().postData()).toContain('add_to_existing');
    return route.fulfill({json:submissions<3?{error:null,success:null,duplicateWarning:{matches:[{
      id:'existing',status:'to_be_completed',inspectionClassification:'standard',customerName:'Test Customer',siteName:'Site',
      scheduledStart:job.scheduledStart,reportTypes:[],assignedTechnicians:[],duplicateReasons:[],missingReportTypes:[{inspectionType:'fire_alarm',label:'Fire alarm'}],canAddReportTypesToExisting:true
    }]}}:{error:null,success:'Report type added.',createdInspectionId:'existing',redirectTo:'/app/admin/inspections/existing'}});
  });
  await page.goto('https://scheduler.test/app/admin/scheduler');
  await fillJob(page);
  await page.getByRole('button',{name:'Create inspection',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Potential Duplicate Inspection Detected'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog',{name:'Create inspection',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog',{name:'Potential Duplicate Inspection Detected'})).toHaveCount(0);
  await page.getByRole('button',{name:'Create inspection',exact:true}).click();
  await page.getByRole('button',{name:'Add Fire alarm To Existing Inspection'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
  await expect(page).toHaveURL('https://scheduler.test/app/admin/scheduler');
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
