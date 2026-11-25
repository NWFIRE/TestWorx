const {chromium,expect}=require('@playwright/test');
const {PrismaClient}=require('@prisma/client');
const fs=require('node:fs'),path=require('node:path');
const db=new PrismaClient({datasources:{db:{url:'postgresql://perf@127.0.0.1:55439/tradeworx_subscriber'}}});
const base='http://localhost:3340',[a,b]=require('./results/fixtures.json').companies,job=require('./results/field-journey.json');
const results=[];
async function check(name,run){try{await run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}console.log(results.at(-1));}
async function login(browser,email){const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'}),page=await context.newPage();await page.goto(base+'/login');await page.getByLabel(/work email/i).fill(email);await page.getByLabel(/password/i).fill('Password123!');await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL(/\/app/);return {context,page};}
(async()=>{const browser=await chromium.launch();try{
 const own=await login(browser,a.officeEmail),other=await login(browser,b.officeEmail),tech=await login(browser,b.techEmail);
 await check('Scheduler detail reads and writes reject a different company',async()=>{
  const before=await db.inspection.findUniqueOrThrow({where:{id:job.inspectionId}});
  const positive=await own.context.request.get(base+'/api/admin/scheduler?id='+job.inspectionId);expect(positive.ok()).toBe(true);expect((await positive.json()).job.id).toBe(job.inspectionId);
  const foreign=await other.context.request.get(base+'/api/admin/scheduler?id='+job.inspectionId);expect(foreign.ok()).toBe(false);
  expect((await tech.context.request.get(base+'/api/admin/scheduler?id='+job.inspectionId)).status()).toBe(403);
  const write=await other.context.request.post(base+'/api/admin/scheduler',{headers:{origin:base},data:{inspectionId:job.inspectionId,updatedAt:before.updatedAt.toISOString(),start:'2026-11-25T10:00',end:'2026-11-25T11:00',technicianIds:[b.techId]}});expect(write.ok()).toBe(false);expect((await write.json()).error).toBe('Inspection not found.');
  expect(await db.inspection.findUniqueOrThrow({where:{id:job.inspectionId}})).toEqual(before);
 });
 await check('Foreign report autosave and finalization fail without changing the report',async()=>{
  const before=await db.inspectionReport.findUniqueOrThrow({where:{id:job.reportId}});
  for(const endpoint of ['autosave','finalize']){const response=await other.context.request.post(base+'/api/reports/'+endpoint,{data:{inspectionReportId:job.reportId,contentJson:before.contentJson}});expect(response.ok()).toBe(false);}
  expect(await db.inspectionReport.findUniqueOrThrow({where:{id:job.reportId}})).toEqual(before);
 });
 await check('Monthly CSV contains only its company inspection IDs',async()=>{
  for(const [company,session] of [[a,own],[b,other]]){
   await session.page.goto(base+'/app/admin/inspections/monthly?month=2026-03');
   const downloadPromise=session.page.waitForEvent('download');await session.page.getByRole('button',{name:'Download CSV',exact:true}).click();const download=await downloadPromise;
   const csv=fs.readFileSync(await download.path(),'utf8');
   const jobs=await db.inspection.findMany({select:{id:true,tenantId:true}});const included=jobs.filter(item=>csv.includes(item.id));
   expect(included.length).toBeGreaterThan(0);expect(included.every(item=>item.tenantId===company.tenantId)).toBe(true);
  }
 });
 await check('Home navigation and search stay within each company',async()=>{
  for(const [company,session] of [[a,own],[b,other]]){
   await session.page.goto(base+'/app/admin/dashboard');await expect(session.page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();
   const hrefs=await session.page.locator('a[href*="/inspections/"]').evaluateAll(links=>links.map(link=>link.getAttribute('href')));
   const ids=hrefs.map(href=>href.split('/inspections/')[1]?.split('?')[0]).filter(Boolean);
   for(const id of ids){const inspection=await db.inspection.findUnique({where:{id}});if(inspection)expect(inspection.tenantId).toBe(company.tenantId);}
   const response=await session.context.request.get(base+'/api/admin/clients/customers?query=Pinecrest');expect(response.ok()).toBe(true);const body=await response.text();expect(body).toContain(company.customerId);expect(body).not.toContain(company===a?b.customerId:a.customerId);
  }
 });
 await check('Cron cannot be invoked by subscriber sessions or anonymous requests',async()=>{
  expect((await own.context.request.get(base+'/api/cron/quote-reminders')).status()).toBe(401);
  const anonymous=await browser.newContext();expect((await anonymous.request.get(base+'/api/cron/quote-reminders')).status()).toBe(401);await anonymous.close();
 });
}finally{fs.writeFileSync(path.join(__dirname,'results/boundaries.json'),JSON.stringify(results,null,2));await browser.close();await db.$disconnect();if(results.some(row=>!row.passed))process.exitCode=1;}})().catch(error=>{console.error(error);process.exitCode=1;});
