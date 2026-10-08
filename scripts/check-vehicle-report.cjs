const assert = require("node:assert/strict");
const path = require("node:path");
const { build } = require("esbuild");
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");

// Exercise the actual shared editor with an in-memory controller, never live customer data.
async function main() {
  const root = path.resolve(__dirname, "..");
  const bundle = await build({ stdin: { contents: `
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { resolveReportTemplate } from "./packages/lib/src/report-config";
    import { buildInitialReportDraft } from "./packages/lib/src/report-engine";
    import { MobileSmartReportScreen } from "./apps/web/src/app/app/tech/mobile-smart-report-screen";
    const draft = buildInitialReportDraft({inspectionType:"vehicle_suppression",siteName:"Fleet depot",customerName:"Example Fleet",scheduledDate:"2026-10-08T14:00:00Z",assetCount:0});
    const data = {reportId:"report",reportStatus:"draft",reportUpdatedAt:new Date().toISOString(),finalizedAt:null,canEdit:true,canFinalize:true,
      inspectionTypeLabel:"Vehicle Fire Suppression",defaultInspectionTypeLabel:"Vehicle Fire Suppression",siteName:"Fleet depot",customerName:"Example Fleet",scheduledDateLabel:"Oct 8, 2026",
      inspectionWorkspace:{inspectionId:"visit",totalTaskCount:1,currentTaskIndex:1,relatedTasks:[{id:"task",displayLabel:"Vehicle Fire Suppression",reportStatus:"draft",isCurrent:true}]},
      template:resolveReportTemplate({inspectionType:"vehicle_suppression"}),draft};
    createRoot(document.getElementById("app")).render(<MobileSmartReportScreen data={data} inspectionId="visit" taskId="task" mode="edit"/>);
  `, resolveDir: root, loader: "tsx" }, bundle: true, write: false, jsx: "automatic", tsconfig: path.join(root, "apps/web/tsconfig.json"),
    define: { "process.env.NODE_ENV": '"development"' }, plugins: [{name:"test-doubles",setup(b) {
      const sources = {
        "next/navigation": "export const useRouter=()=>({push(){},back(){},refresh(){}});",
        "next/image": "import React from 'react'; export default function Image({unoptimized,...props}){return React.createElement('img',props)}",
        "./add-report-type-control": "export const AddReportTypeControl=()=>null;",
        "./remove-report-types-control": "export const RemoveReportTypesControl=()=>null;",
        "./job-time-control": "export const useJobTime=()=>({canEdit:true}); export const JobTimeControl=()=>null;",
        "./offline/offline-db": "export const listLocalWorkOrderLineItems=async()=>[]; export const subscribeToOfflineChanges=()=>()=>{}; export const putLocalWorkOrderLineItem=async()=>{}; export const deleteLocalWorkOrderLineItem=async()=>{};",
        "./offline/offline-sync": "export const queueWorkOrderLaborLineItemUpsert=async()=>{}; export const queueWorkOrderLineItemDelete=async()=>{}; export const queueWorkOrderLineItemUpsert=async()=>{};",
        "@testworx/lib": `export * from "${root.replaceAll("\\", "/")}/packages/lib/src/report-engine"; export * from "${root.replaceAll("\\", "/")}/packages/lib/src/mobile-inspection-progress";`,
        "./use-mobile-report-draft-controller": `
          import {useState} from "react";
          export function useMobileReportDraftController({data}){
            const [draft,setDraft]=useState(data.draft); window.draft=draft;
            const mutate=fn=>setDraft(current=>{const next=structuredClone(current);fn(next);return next});
            return {draft,hydrated:true,saveState:"Saved",persistCurrentDraftLocally:async()=>{},flushDraftSync:async()=>{},
              selectSection(id){mutate(d=>{d.activeSectionId=id})},
              updateSectionField(section,field,value){mutate(d=>{d.sections[section].fields[field]=value})},
              addRepeaterRow(section,field){mutate(d=>{d.sections[section].fields[field.id].push({})})},
              removeRepeaterRow(section,field,index){mutate(d=>{d.sections[section].fields[field].splice(index,1)})},
              updateRepeaterRowField(section,field,index,key,value){mutate(d=>{d.sections[section].fields[field.id][index][key]=value})},
              updateSignerName(){},updateSignature(){},finalizeReport:async()=>({ok:true,queued:false})};
          }
        `
      };
      b.onResolve({filter:/.*/},args => Object.hasOwn(sources,args.path) ? {path:args.path,namespace:"test"} : undefined);
      b.onLoad({filter:/.*/,namespace:"test"},args=>({contents:sources[args.path],resolveDir:root,loader:"tsx"}));
    }}] });
  const css = await postcss([tailwind({content:["apps/web/src/app/app/tech/mobile-smart-report-screen.tsx","apps/web/src/app/app/tech/mobile-inspection-framework.tsx","apps/web/src/app/app/tech/signature-pad.tsx"]})]).process("@tailwind base; @tailwind utilities;",{from:undefined});
  const browser=await chromium.launch();
  try {
    for(const width of [390,768,1366]){
      const page=await browser.newPage({viewport:{width,height:900}});
      const errors=[];
      page.on("pageerror",e=>errors.push(e.message));
      await page.setContent('<div id="app"></div>');
      await page.addStyleTag({content:css.css});
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.getByLabel("Vehicle identification / VIN / unit number",{exact:true}).fill("UNIT-99");
      await page.getByLabel("Date of service",{exact:true}).fill("2026-10-08");
      await page.getByRole("button",{name:"Semi-annual maintenance",exact:true}).click();
      assert.equal(await page.evaluate(()=>window.draft.sections["vehicle-information"].fields.vehicleId),"UNIT-99");
      await page.getByRole("button",{name:/Daily inspection.*Open/}).click();
      const daily=page.locator("section").filter({has:page.getByRole("heading",{name:"Daily inspection",exact:true})}).last();
      await daily.getByRole("button",{name:"Fail",exact:true}).first().click();
      await daily.getByLabel("Notes / failed checks",{exact:false}).fill("Power indicator failed; office notified.");
      assert.equal(await page.evaluate(()=>window.draft.sections["daily-inspection"].fields.panelPower),"fail");
      assert.match(await page.evaluate(()=>window.draft.sections["daily-inspection"].fields.notes),/office notified/);
      await page.getByRole("button",{name:/Agent cylinders.*Open/}).click();
      await page.getByRole("button",{name:"Add cylinder",exact:true}).click();
      assert.ok(await page.evaluate(()=>window.draft.sections["agent-cylinders"].fields.cylinders.length>=1));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);
      await page.close();
    }
    console.log("PASS: vehicle editor at phone/tablet/desktop widths; service selection, calendar date, field edits, failures/notes and cylinder rows; no overflow or runtime errors.");
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
