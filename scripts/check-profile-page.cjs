const assert=require("node:assert/strict");
const path=require("node:path");
const {build}=require("esbuild");
const {chromium}=require("@playwright/test");
const postcss=require("postcss");
const tailwind=require("tailwindcss");

async function main(){
  const css=await postcss([tailwind({content:["apps/web/src/app/app/profile/*.tsx"]})]).process("@tailwind base; @tailwind utilities;",{from:undefined});
  const bundle=await build({stdin:{contents:`
    import React from "react"; import {createRoot} from "react-dom/client";
    import Page from "./apps/web/src/app/app/profile/page";
    window.profile={name:"Jordan Smith",email:"jordan.smith@example.com",role:"office_admin",createdAt:new Date("2025-01-01T00:00:00Z"),tenant:{name:"Northwest Fire & Safety",timezone:"America/Chicago"},customerCompany:null};
    window.saved=[]; const root=createRoot(document.getElementById("app"));
    window.renderProfile=async()=>root.render(await Page()); window.renderProfile();
  `,loader:"tsx",resolveDir:path.resolve(__dirname,"..")},bundle:true,write:false,jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"profile-test",setup(b){
    b.onResolve({filter:/^(next\/link|next\/navigation|@\/auth|@testworx\/lib\/server\/index)$/},args=>({path:args.path,namespace:"test"}));
    b.onResolve({filter:/^\.\/actions$/},args=>args.importer.replaceAll("\\","/").endsWith("profile/page.tsx")?{path:"actions",namespace:"test"}:undefined);
    b.onLoad({filter:/.*/,namespace:"test"},args=>({loader:"jsx",resolveDir:path.resolve(__dirname,".."),contents:{
      "next/link":'export default function Link({children,...props}){return <a {...props}>{children}</a>}',
      "next/navigation":'export const redirect=()=>{throw Error("Unexpected redirect")}',
      "@/auth":'export const auth=async()=>({user:{id:"self",tenantId:"tenant"}})',
      "@testworx/lib/server/index":'export const getOwnUserProfile=async()=>window.profile',
      "actions":'export const updateProfileAction=async(_,fd)=>{await new Promise(r=>setTimeout(r,250)); const name=fd.get("name").trim(); if(!name)return {error:"Enter a name",success:null};window.saved.push(Object.fromEntries(fd)); window.profile.name=name;return {error:null,success:"Your profile has been updated."}}'
    }[args.path]}));
  }}]});
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.route("http://localhost/**",r=>r.fulfill({contentType:"text/html",body:'<body style="background:#f1f5f9;padding:24px"><div id="app"></div></body>'}));
    await page.goto("http://localhost/profile");await page.addStyleTag({content:css.css+' .btn-brand-primary{background:#2f6bb2;color:white}'});await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole("heading",{name:"My profile",exact:true}).waitFor();
    for(const width of [320,390,768,1280]){
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Overflow at ${width}`);
      if(width===390||width===1280)await page.screenshot({path:`outputs/profile-${width}.png`,fullPage:true});
    }
    assert.equal(await page.getByRole("textbox").count(),1,"Only display name is editable");
    const field=page.getByLabel("Display name",{exact:true});
    await field.fill("   ");await page.getByRole("button",{name:"Save changes"}).click();await page.getByRole("alert").waitFor();
    await field.fill("Jordan Updated");await page.getByRole("button",{name:"Save changes"}).click();
    assert.equal(await page.getByRole("button",{name:"Saving..."}).isDisabled(),true);
    await page.getByRole("status").waitFor();
    assert.equal(await page.evaluate(()=>saved[0].name),"Jordan Updated");
    await page.evaluate(()=>renderProfile());await page.getByRole("heading",{name:"Jordan Updated",exact:true}).waitFor();
    await page.evaluate(()=>{profile.role="technician";return renderProfile()});
    assert.equal(await page.getByRole("link",{name:/Offline readiness/}).getAttribute("href"),"/app/tech/profile");
    assert.deepEqual(errors,[]);console.log("PASS: profile responsive layout, editable field boundary, validation feedback, pending/success states, refreshed name, technician tools link.");
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
