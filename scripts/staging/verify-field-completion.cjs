const {chromium,expect}=require('@playwright/test');
const {PrismaClient}=require('@prisma/client');
const fs=require('node:fs'),path=require('node:path');
const db=new PrismaClient({datasources:{db:{url:'postgresql://perf@127.0.0.1:55439/tradeworx_subscriber'}}});
const base='http://localhost:3340',a=require('./results/fixtures.json').companies[0],job=require('./results/field-journey.json');
const result={inspectionId:job.inspectionId};
async function login(browser,email,mobile=false){const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},serviceWorkers:'block'});const page=await context.newPage();await page.goto(base+'/login');await page.getByLabel(/work email/i).fill(email);await page.getByLabel(/password/i).fill('Password123!');await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL(/\/app/);return {context,page};}
(async()=>{const browser=await chromium.launch();let page;try{
 const tech=await login(browser,a.techEmail,true),office=await login(browser,a.officeEmail);page=tech.page;
 const before=await db.inspectionReport.findUniqueOrThrow({where:{id:job.reportId}});
 await page.goto(base+`/app/tech/reports/${job.inspectionId}/${job.taskId}`);
 await expect(page.getByRole('button',{name:'Pause job',exact:true})).toBeVisible();
 expect((await db.inspectionReport.findUniqueOrThrow({where:{id:job.reportId}})).status).toBe(before.status);result.viewReadOnly=true;
 await page.getByRole('button',{name:/.*Edit$/i}).first().click();
 const location=page.getByPlaceholder('Lobby by east stair').last(),marker='Verified staging lobby '+Date.now();
 await page.route('**/api/reports/autosave',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"Staging simulated save failure"}'}));
 await location.fill(marker);await page.waitForTimeout(2500);await expect(location).toHaveValue(marker);result.failedSavePreservedInput=true;
 await page.unroute('**/api/reports/autosave');await location.fill(marker+' recovered');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(async()=>JSON.stringify((await db.inspectionReport.findUniqueOrThrow({where:{id:job.reportId}})).contentJson),{timeout:45000}).toContain(marker+' recovered');
 result.assetLocationOverridePersisted=true;
 await page.getByPlaceholder('Add extinguisher notes').fill('Annual inspection completed during staging verification.');
 await expect.poll(async()=>(await db.inspection.findUniqueOrThrow({where:{id:job.inspectionId}})).status,{timeout:30000}).toBe('in_progress');
 expect((await db.inspection.findUniqueOrThrow({where:{id:job.inspectionId}})).status).toBe('in_progress');result.editTriggersPendingRule=true;
 const schedule=await (await office.context.request.get(base+'/api/admin/scheduler?id='+job.inspectionId)).json();expect(schedule.job.status).toBe('in_progress');result.secondOfficeSessionSeesProgress=true;
 for(let i=0;i<2;i++){
  await page.getByPlaceholder('Signer name').nth(i).fill(i===0?'Alex Turner':'Staging Customer');
  const canvas=page.locator('canvas').nth(i);await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();
  await page.mouse.move(box.x+20,box.y+40);await page.mouse.down();await page.mouse.move(box.x+110,box.y+60,{steps:10});await page.mouse.move(box.x+190,box.y+25,{steps:10});await page.mouse.up();
 }
 const finalize=page.getByRole('button',{name:/^Finalize (Inspection|Fire extinguisher)$/i});
 await expect(finalize).toBeEnabled({timeout:30000});
 await finalize.click();
 await expect.poll(async()=>(await db.inspectionReport.findUniqueOrThrow({where:{id:job.reportId}})).status,{timeout:60000}).toBe('finalized');
 const report=await db.inspectionReport.findUniqueOrThrow({where:{id:job.reportId}});result.finalizedThroughMobileUI=true;
 const billing=await db.inspectionBillingSummary.findUnique({where:{inspectionId:job.inspectionId}});expect(billing).not.toBeNull();result.billingStatus=billing.status;
 const pdf=await db.attachment.findFirstOrThrow({where:{inspectionReportId:job.reportId,kind:'pdf',source:'generated'},orderBy:{createdAt:'desc'}});
 const response=await office.context.request.get(base+'/api/attachments/'+pdf.id);expect(response.status()).toBe(200);expect((await response.body()).subarray(0,5).toString()).toBe('%PDF-');fs.writeFileSync(path.join(__dirname,'results/field-completed-report.pdf'),await response.body());result.generatedPdf=true;
 await office.page.goto(base+'/app/help/delivery?number='+report.reportNumber);await office.page.getByRole('button',{name:'Send issued report to customer',exact:true}).click();
 await expect.poll(()=>db.capturedEmail.count({where:{dedupeKey:{startsWith:'report-delivery-'},attachmentNames:{has:pdf.fileName}}}),{timeout:30000}).toBeGreaterThan(0);
 expect(await db.inspectionReport.findUniqueOrThrow({where:{id:job.reportId}})).toEqual(report);result.deliveredWithoutReportMutation=true;
 await page.screenshot({path:path.join(__dirname,'results/field-completed-mobile.png'),fullPage:true});result.passed=true;
}catch(error){result.error=error.message;result.passed=false;process.exitCode=1;if(page)fs.writeFileSync(path.join(__dirname,'results/field-completion-debug.txt'),await page.locator('body').innerText());}finally{fs.writeFileSync(path.join(__dirname,'results/field-completion.json'),JSON.stringify(result,null,2));console.log(result);await browser.close();await db.$disconnect();}})();
