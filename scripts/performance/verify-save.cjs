const {chromium,expect}=require('@playwright/test');
const {PrismaClient}=require('@prisma/client');
const fs=require('node:fs'), path=require('node:path');
const a=require('./results/fixture.json').companies[0], base='http://localhost:3339';
const db=new PrismaClient({datasources:{db:{url:'postgresql://perf@127.0.0.1:55439/tradeworx_perf'}}});
async function login(browser,email){const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',...(process.env.PERF_IDENTITY?{extraHTTPHeaders:{'Accept-Encoding':'identity'}}:{})});const page=await context.newPage();await page.goto(base+'/login');await page.getByLabel(/work email/i).fill(email);await page.getByLabel(/password/i).fill('Password123!');await Promise.all([page.waitForURL(/\/app/),page.getByRole('button',{name:/sign in/i}).click()]);return{context,page};}
(async()=>{
 const browser=await chromium.launch();const result={encoding:process.env.PERF_IDENTITY?'identity':'browser default'};let debugPage;
 const draftLocation=`PERFORMANCE TEST LOCATION ${Date.now()}`, recoveredLocation=`${draftLocation} RECOVERED`;
 try {
  const tech=await login(browser,a.techEmail), office=await login(browser,a.officeEmail), page=tech.page;
  debugPage=page;
  await page.goto(base+`/app/tech/reports/${a.inspectionId}/${a.taskId}`);
  const start=page.getByRole('button',{name:/^(Start job|Resume job)$/});
  await expect(page.getByRole('button',{name:/^(Start job|Resume job|Pause job)$/})).toBeEnabled({timeout:15000});
  if(await start.count()) await start.click();
  await expect(page.getByRole('button',{name:'Pause job',exact:true})).toBeVisible();
  const before=await db.inspectionReport.findUniqueOrThrow({where:{id:a.reportId}});
  let attempts=0;
  await page.route('**/api/reports/autosave',async route=>{attempts++;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Isolated simulated temporary failure'})});});
  await page.getByRole('button',{name:'Add extinguisher',exact:true}).first().click();
  await page.getByRole('button',{name:/Item #.*Edit/i}).last().click();
  const input=page.getByPlaceholder('Lobby by east stair').last();
  await expect(input).toBeEnabled();
  const clickAt=performance.now();
  await input.fill(draftLocation);
  await expect(page.getByText(/Pending sync|Saving|Saved on device|Saved locally|Will retry/, {exact:true}).first()).toBeVisible();
  result.saveFeedbackMs=Math.round(performance.now()-clickAt);
  await expect.poll(()=>attempts,{timeout:15000}).toBeGreaterThan(0);
  await expect(input).toHaveValue(draftLocation);
  expect((await db.inspectionReport.findUniqueOrThrow({where:{id:a.reportId}})).autosaveVersion).toBe(before.autosaveVersion);
  result.failurePreservesEnteredValue=true;
  await page.unroute('**/api/reports/autosave');
  const recovery=performance.now();
  await input.fill(recoveredLocation);
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect.poll(async()=> JSON.stringify((await db.inspectionReport.findUniqueOrThrow({where:{id:a.reportId}})).contentJson),{timeout:45000}).toContain(recoveredLocation);
  result.confirmedRecoveryMs=Math.round(performance.now()-recovery);
  await expect(page.getByText('Saved',{exact:true}).first()).toBeVisible({timeout:15000});
  const saved=await db.inspectionReport.findUniqueOrThrow({where:{id:a.reportId}});
  expect(JSON.stringify(saved.contentJson)).toContain(recoveredLocation);
  expect((await db.inspection.findUniqueOrThrow({where:{id:a.inspectionId}})).status).toBe('in_progress');
  result.editTriggersPendingRule=true;
  const scheduler=await (await office.context.request.get(base+`/api/admin/scheduler?id=${a.inspectionId}`)).json();
  expect(scheduler.job.status).toBe('in_progress');
  result.secondOfficeSessionSeesProgress=true;
  await page.reload();await page.getByRole('button',{name:new RegExp(`${recoveredLocation}.*Edit`,'i')}).last().click();await expect(page.getByPlaceholder('Lobby by east stair').last()).toHaveValue(recoveredLocation);
  result.savedValueSurvivesReload=true;
  await page.getByRole('button',{name:'Pause job',exact:true}).click();
  result.passed=true;
 }catch(error){result.passed=false;result.error=error.message;process.exitCode=1;if(debugPage)fs.writeFileSync(path.join(__dirname,'results/save-debug.txt'),await debugPage.locator('body').innerText());}
 finally {fs.writeFileSync(path.join(__dirname,'results/save-verification.json'),JSON.stringify(result,null,2));console.log(result);await browser.close();await db.$disconnect();}
})().catch(error=>{console.error(error);process.exitCode=1;});
