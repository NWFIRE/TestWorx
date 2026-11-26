const { chromium, expect } = require('@playwright/test');
expect.configure({ timeout: 15000 });
const { PrismaClient } = require('@prisma/client');
const fs = require('node:fs');
const path = require('node:path');
const base='http://localhost:3340';
const db=new PrismaClient({datasources:{db:{url:'postgresql://perf@127.0.0.1:55439/tradeworx_subscriber'}}});
const fixture=require('./results/fixtures.json');
const results=[];
const out=path.join(__dirname,'results');
async function check(name,run){try{await run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results.at(-1)));}
async function login(browser,email,mobile=false){const context=await browser.newContext({serviceWorkers:'block',viewport:mobile?{width:390,height:844}:{width:1440,height:900}});const page=await context.newPage();await page.goto(base+'/login');await page.getByLabel(/work email/i).fill(email);await page.getByLabel(/password/i).fill('Password123!');await Promise.all([page.waitForURL(/\/app(?:\/|$)/),page.getByRole('button',{name:/sign in/i}).click()]);return {context,page};}
(async()=>{
 const browser=await chromium.launch();
 const [a,b]=fixture.companies;
 let ticketId;
 try{
  const tech=await login(browser,a.techEmail,true),other=await login(browser,b.officeEmail),operator=await login(browser,'platform@nwfiredemo.com'),office=await login(browser,a.officeEmail);
  await check('Mobile technician submits blocked request with private screenshot',async()=>{
   await tech.page.goto(base+`/app/help/new?report=${a.reportId}&from=/app/tech/inspections/${a.inspectionId}`);
   await tech.page.getByLabel('Subject',{exact:true}).fill('Staging report delivery problem');
   await tech.page.getByLabel('What happened?',{exact:true}).fill('The customer did not receive the completed report. Please investigate the delivery.');
   await tech.page.getByLabel('This is blocking my work').check();
   const screenshot=await tech.page.screenshot();
   await tech.page.getByLabel(/Screenshot \(optional/).setInputFiles({name:'screen.png',mimeType:'image/png',buffer:screenshot});
   await tech.page.getByRole('button',{name:'Send request',exact:true}).click();
   await tech.page.waitForURL(/\/app\/help\/(?!new)[^/?]+$/);
   ticketId=tech.page.url().split('/').pop();
   await expect(tech.page.getByText(/SUP-\d+/)).toBeVisible();
   expect(await tech.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await tech.page.screenshot({path:path.join(out,'mobile-support.png'),fullPage:true});
  });
  await check('Other subscriber cannot read ticket, screenshot or operator tools',async()=>{
   expect(ticketId).toBeTruthy();
   const response=await other.page.goto(base+'/app/help/'+ticketId);
   await expect(other.page.getByText('Staging report delivery problem',{exact:true})).toHaveCount(0);
   expect((await other.context.request.get(base+`/api/support/${ticketId}/screenshot`)).status()).toBe(404);
   await other.page.goto(base+'/app/platform/support');
   await expect(other.page.getByRole('heading',{name:'Platform Support',exact:true})).toHaveCount(0);
  });
  await check('Operator finds request, keeps note private, retries once, replies and resolves',async()=>{
   expect(ticketId).toBeTruthy();
   await db.reportDelivery.update({where:{id:a.deliveryId},data:{status:'failed',failureCode:'email_configuration'}});
   await operator.page.goto(base+'/app/platform/support');
   await operator.page.getByLabel('Company or ticket number').fill(a.name);
   await operator.page.getByRole('button',{name:'Search',exact:true}).click();
   await operator.page.getByRole('link').filter({hasText:'Staging report delivery problem'}).first().click();
   await operator.page.getByLabel('Message',{exact:true}).fill('Private staging investigation note');
   await operator.page.getByRole('button',{name:'Internal note',exact:true}).click();
   await expect(operator.page.getByText('Private staging investigation note',{exact:true})).toBeVisible();
   const before=await db.inspectionReport.findUniqueOrThrow({where:{id:a.reportId}});
   await operator.page.getByRole('button',{name:'Retry failed delivery',exact:true}).click();
   await expect(operator.page.getByRole('button',{name:'Retry failed delivery',exact:true})).toHaveCount(0);
   await expect.poll(()=>db.capturedEmail.count({where:{dedupeKey:'report-delivery-'+a.deliveryId}})).toBe(1);
   expect(await db.inspectionReport.findUniqueOrThrow({where:{id:a.reportId}})).toEqual(before);
   await operator.page.getByLabel('Message',{exact:true}).fill('Your report delivery is confirmed.');
   await operator.page.getByRole('button',{name:'Send reply',exact:true}).click();
   await expect(operator.page.getByText('Your report delivery is confirmed.',{exact:true})).toBeVisible();
   await operator.page.getByRole('button',{name:'Mark resolved',exact:true}).click();
   await expect(operator.page.getByRole('button',{name:'Reopen request',exact:true})).toBeVisible();
   await operator.page.screenshot({path:path.join(out,'operator-support.png'),fullPage:true});
  });
  await check('Technician sees reply but not internal note and can reopen',async()=>{
   await tech.page.goto(base+'/app/help/'+ticketId);
   await expect(tech.page.getByText('Your report delivery is confirmed.',{exact:true}).filter({visible:true})).toBeVisible();
   await expect(tech.page.getByText('Private staging investigation note',{exact:true})).toHaveCount(0);
   await tech.page.getByRole('button',{name:'Reopen request',exact:true}).click();
   await expect(tech.page.getByRole('button',{name:'Reopen request',exact:true})).toHaveCount(0);
  });
  await check('Cross-company inspection, customer, scheduler and PDF boundaries',async()=>{
   const own=await office.context.request.get(base+'/api/attachments/'+a.attachmentId);
   expect(own.status()).toBe(200);expect((await own.body()).subarray(0,5).toString()).toBe('%PDF-');
   expect((await other.context.request.get(base+'/api/attachments/'+a.attachmentId)).status()).not.toBe(200);
   await other.page.goto(base+'/app/admin/inspections/'+a.inspectionId);
   await expect(other.page.getByText(a.name,{exact:true})).toHaveCount(0);
   const search=await other.context.request.get(base+'/api/admin/clients/customers?query=Pinecrest');
   expect(search.status()).toBe(200);const searchText=await search.text();expect(searchText).not.toContain(a.customerId);expect(searchText).toContain(b.customerId);
   const schedule=await other.context.request.get(base+'/api/admin/scheduler?date=2026-11-25&view=day');
   expect(await schedule.text()).not.toContain(a.inspectionId);
  });
  await check('Owners invite office staff and technicians into their existing company without another subscription',async()=>{
   const tenantCount=await db.tenant.count();
   for(const owner of [office,other])for(const role of ['office_admin','technician']){
    const tenantId=owner===office?a.tenantId:b.tenantId,email=`invite-${role}-${Date.now()}@example.test`;
    await owner.page.goto(base+'/app/admin/team');
    const form=owner.page.locator('form').filter({has:owner.page.getByRole('button',{name:'Create team invite',exact:true})});
    await form.locator('input[name="name"]').fill('Staging Invited Member');await form.locator('input[name="email"]').fill(email);await form.locator('select[name="role"]').selectOption(role);await form.getByRole('button',{name:'Create team invite',exact:true}).click();
    await expect.poll(()=>db.capturedEmail.count({where:{recipient:email}})).toBe(1);
    const mail=await db.capturedEmail.findFirstOrThrow({where:{recipient:email}});const url=mail.html.match(/href="([^" ]*accept-invite[^" ]*)"/)[1];
    const inviteContext=await browser.newContext(),page=await inviteContext.newPage();await page.goto(url.replaceAll('&amp;','&'));
    await page.getByLabel('Create password',{exact:true}).fill('StagingPassword123!');await page.getByLabel('Confirm password',{exact:true}).fill('StagingPassword123!');await page.getByRole('button',{name:'Create account',exact:true}).click();
    await expect.poll(()=>db.user.count({where:{email,tenantId,role}})).toBe(1);await inviteContext.close();
   }
   expect(await db.tenant.count()).toBe(tenantCount);
  });
  await check('Both companies download their own generated branded PDF',async()=>{
   for(const [company,owner] of [[a,office],[b,other]]){
    const response=await owner.context.request.get(base+'/api/attachments/'+company.attachmentId);expect(response.status()).toBe(200);
    fs.writeFileSync(path.join(out,company===a?'evergreen-report.pdf':'northshore-report.pdf'),await response.body());
   }
  });
  await check('Owner subscription page reachable, technician denied, viewing inspection read-only',async()=>{
   await office.page.goto(base+'/app/admin/settings/subscription');await expect(office.page.getByRole('heading',{name:'Subscription',exact:true})).toBeVisible();
   await tech.page.goto(base+'/app/admin/settings/subscription');await expect(tech.page.getByRole('heading',{name:'Subscription',exact:true})).toHaveCount(0);
   const before=await db.inspection.findUniqueOrThrow({where:{id:a.inspectionId}});
   await office.page.goto(base+'/app/admin/inspections/'+a.inspectionId);await office.page.waitForTimeout(600);
   expect(await db.inspection.findUniqueOrThrow({where:{id:a.inspectionId}})).toEqual(before);
  });
  await check('Existing signed-in technician loses access immediately after deactivation',async()=>{
   await db.user.update({where:{id:a.techId},data:{isActive:false}});
   try{await tech.page.goto(base+'/app/help');await expect(tech.page).toHaveURL(/\/login/);}finally{await db.user.update({where:{id:a.techId},data:{isActive:true}});}
  });
  await check('New owner verifies email and gets a separate empty workspace, not operational access before billing',async()=>{
   const context=await browser.newContext();const page=await context.newPage();const email=`owner-${Date.now()}@example.test`;
   await page.goto(base+'/signup');await page.getByLabel('Your name',{exact:true}).fill('Staging Owner');await page.getByLabel('Company name',{exact:true}).fill('Copper Ridge Staging');await page.getByLabel('Work email',{exact:true}).fill(email);await page.getByLabel(/Password/).fill('StagingPassword123!');await page.getByRole('button',{name:'Create workspace',exact:true}).click();await expect(page.getByText(/Check your email for a verification link/)).toBeVisible();
   const mail=await db.capturedEmail.findFirstOrThrow({where:{recipient:email},orderBy:{createdAt:'desc'}});const url=mail.html.match(/href="([^"]+)"/)[1];await page.goto(url);await page.getByRole('button',{name:'Verify email and create workspace',exact:true}).click();await expect(page.getByText(/Your private workspace is ready/)).toBeVisible();
   const user=await db.user.findUniqueOrThrow({where:{email}});expect(user.tenantId).not.toBe(a.tenantId);expect(await db.customerCompany.count({where:{tenantId:user.tenantId}})).toBe(0);
   await page.goto(base+'/login');await page.getByLabel(/work email/i).fill(email);await page.getByLabel(/password/i).fill('StagingPassword123!');await page.getByRole('button',{name:/sign in/i}).click();await expect(page).toHaveURL(/\/app\/admin\/settings\/subscription/);
   await page.goto(base+'/app/admin/inspections');await expect(page).toHaveURL(/\/app\/admin\/settings\/subscription/);
   await page.goto(base+'/app/help');await expect(page.getByRole('heading',{name:'My requests',exact:true})).toBeVisible();
   await page.getByRole('link',{name:'Report a problem',exact:true}).click();
   await page.getByLabel('Subject',{exact:true}).fill('Subscription assistance');
   await page.getByLabel('What happened?',{exact:true}).fill('Please help me activate the new company subscription.');
   await page.getByRole('button',{name:'Send request',exact:true}).click();
   await page.waitForURL(/\/app\/help\/(?!new)[^/?]+$/).catch(async error=>{console.log('Support submit diagnostic',page.url(),await page.locator('body').innerText());throw error;});
   await page.getByLabel('Message',{exact:true}).fill('Additional subscription context.');
   await page.getByRole('button',{name:'Send reply',exact:true}).click();
   await expect(page.getByText('Additional subscription context.',{exact:true})).toBeVisible();
   await context.close();
  });
  await check('Shared browser switches companies without reusing offline snapshots or cached navigation',async()=>{
   const same=await login(browser,a.techEmail,true),page=same.page;
   await page.goto(base+'/app/tech');await expect(page.getByText('Preparing your workspace...')).toHaveCount(0,{timeout:15000});
   const firstName='tradeworx-technician-offline:'+encodeURIComponent(a.tenantId+':'+a.techId);
   await page.evaluate(async name=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name,2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({key:'tenant-marker',value:'company-a'});tx.oncomplete=resolve;tx.onerror=reject;});db.close();
    const cache=await caches.open('tradeworx-pwa-v2:app-shell');await cache.put('/app/tech/work',new Response('PRIVATE COMPANY A MARKER'));
   },firstName);
   const csrf=await (await same.context.request.get(base+'/api/auth/csrf')).json();await same.context.request.post(base+'/api/auth/signout',{form:{csrfToken:csrf.csrfToken,callbackUrl:base+'/login'}});
   await page.goto(base+'/login');await page.getByLabel(/work email/i).fill(b.techEmail);await page.getByLabel(/password/i).fill('Password123!');await page.getByRole('button',{name:/sign in/i}).click();await page.waitForURL(/\/app/);
   await expect(page.getByText('Preparing your workspace...')).toHaveCount(0,{timeout:15000});
   const secondName='tradeworx-technician-offline:'+encodeURIComponent(b.tenantId+':'+b.techId);
   await expect.poll(()=>page.evaluate(async name=>(await indexedDB.databases()).some(db=>db.name===name),secondName)).toBe(true);
   expect(await page.evaluate(async name=>{const request=indexedDB.open(name,2);const db=await new Promise(resolve=>request.onsuccess=()=>resolve(request.result));const read=db.transaction('meta').objectStore('meta').get('tenant-marker');const value=await new Promise(resolve=>read.onsuccess=()=>resolve(read.result));db.close();return value;},secondName)).toBeUndefined();
   expect(await page.evaluate(async()=>{const response=await caches.match('/app/tech/work');return response?await response.text():'';})).not.toContain('PRIVATE COMPANY A MARKER');
   await same.context.close();
  });
 }finally{await browser.close();await db.$disconnect();}
 if(results.some(item=>!item.passed))process.exitCode=1;
})().catch(error=>{console.error(error);process.exitCode=1;db.$disconnect();});
