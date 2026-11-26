const {chromium,expect:baseExpect}=require('@playwright/test');
const expect=baseExpect.configure({timeout:30000});
const {randomBytes}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const base='https://tradeworx-subscriber-sandbox.vercel.app';
const project=JSON.parse(fs.readFileSync(path.join(root,'.vercel/project.json'),'utf8'));
if(project.projectId!=='prj_su2r87mUde6ttMAREVbUrpBZgwFl')throw new Error('Sandbox only.');
const accounts=JSON.parse(fs.readFileSync(path.join(root,'.vercel/sandbox-accounts.json'),'utf8'));
const [a,b]=require('./results/fixtures.json').companies;
const token=randomBytes(16).toString('hex');
const results=[];
function protection(body){
  const file=path.join(root,'.vercel/test-protection.json');fs.writeFileSync(file,JSON.stringify(body));
  const result=spawnSync(process.execPath,['C:/Users/Jerem/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api','/v1/projects/tradeworx-subscriber-sandbox/protection-bypass','-X','PATCH','--input',file,'--silent','--scope','nw-fire'],{cwd:root,encoding:'utf8'});
  if(result.status!==0)throw new Error('Sandbox test credential management failed: '+String(result.stderr).replaceAll(token,'[redacted]'));
}
async function check(name,fn){try{await fn();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message.replaceAll(token,'[redacted]')});}console.log(results.at(-1));}
function cleanupTestAccess(){
  const response=spawnSync(process.execPath,['C:/Users/Jerem/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api','/v9/projects/tradeworx-subscriber-sandbox','--scope','nw-fire','--raw'],{cwd:root,encoding:'utf8'});
  if(response.status!==0)throw new Error('Unable to verify test-access cleanup.');
  const project=JSON.parse(response.stdout);
  for(const [secret,info] of Object.entries(project.protectionBypass||{}))if(info.note==='Temporary subscriber sandbox smoke test')protection({revoke:{secret,regenerate:false}});
}
(async()=>{
  if(process.argv.includes('--cleanup-only')){cleanupTestAccess();console.log('Temporary sandbox test access revoked.');return;}
  await check('Anonymous visitors cannot access the sandbox app or files',async()=>{
    for(const route of ['/login','/api/attachments/'+a.attachmentId]){const response=await fetch(base+route,{redirect:'manual'});expect([401,403,302,307]).toContain(response.status);if([302,307].includes(response.status))expect(response.headers.get('location')).toMatch(/vercel\.com/);}
  });
  protection({generate:{secret:token,note:'Temporary subscriber sandbox smoke test'}});
  await expect.poll(async()=>{const response=await fetch(base+'/login',{headers:{'x-vercel-protection-bypass':token}});return (await response.text()).includes('Work email');},{timeout:60000}).toBe(true);
  const browser=await chromium.launch();
  async function login(email,mobile=false){
    const account=accounts.find(a=>a.email===email);
    if(!account)throw new Error('Missing private sandbox test account');
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},extraHTTPHeaders:{'x-vercel-protection-bypass':token},serviceWorkers:'block'});
    // Establish the provider's protected browser cookie before testing application login.
    await expect.poll(async()=>{
      const response=await context.request.get(base+'/login',{headers:{'x-vercel-set-bypass-cookie':'true'}});
      return (await response.text()).includes('Work email');
    },{timeout:60000}).toBe(true);
    const page=await context.newPage();
    try {
      await expect.poll(async()=>{
        await page.goto(base+'/login');
        return page.getByLabel(/work email/i).isVisible();
      },{timeout:60000}).toBe(true);
      await page.getByLabel(/work email/i).fill(email);
      await page.getByLabel(/password/i).fill(account.password);
      await page.getByRole('button',{name:/sign in/i}).click();
      await page.waitForURL(/\/app/,{timeout:60000,waitUntil:'domcontentloaded'});
    } catch(error) {
      await page.screenshot({path:path.join(__dirname,'results/hosted-login-failure.png')});
      throw new Error('Hosted login failed at '+new URL(page.url()).origin+new URL(page.url()).pathname+'; '+(await page.locator('body').innerText()).slice(0,1200).replaceAll(account.password,'[redacted]'));
    }
    return {context,page};
  }
  try {
    let own,other;
    await check('Both fictional office users can sign in to their own hosted Home',async()=>{
      own=await login(a.officeEmail);other=await login(b.officeEmail);
      for(const session of [own,other])await expect(session.page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();
    });
    await check('Hosted search and PDFs enforce the company boundary',async()=>{
      if(!own||!other)throw new Error('Office login prerequisite failed');
      const search=await own.context.request.get(base+'/api/admin/clients/customers?query=Pinecrest');expect(search.ok()).toBe(true);const body=await search.text();expect(body).toContain(a.customerId);expect(body).not.toContain(b.customerId);
      const pdf=await own.context.request.get(base+'/api/attachments/'+a.attachmentId);expect(pdf.ok()).toBe(true);expect((await pdf.body()).subarray(0,5).toString()).toBe('%PDF-');
      expect((await other.context.request.get(base+'/api/attachments/'+a.attachmentId)).ok()).toBe(false);
    });
    await check('Technician mobile view works and operator tools remain restricted',async()=>{
      const tech=await login(a.techEmail,true);await tech.page.goto(base+'/app/tech/inspections');await expect(tech.page.getByRole('heading',{name:/inspections/i}).first()).toBeVisible();
      await tech.page.goto(base+'/app/platform/support');await expect(tech.page.getByText('This page could not be found.')).toBeVisible();await expect(tech.page.getByRole('heading',{name:'Report delivery operations'})).toHaveCount(0);
      await tech.page.goto(base+'/app/tech/inspections');
      await expect(tech.page.getByRole('heading',{name:'In field right now'})).toBeVisible();
      await tech.page.screenshot({path:path.join(__dirname,'results/hosted-tech.png'),fullPage:true});
    });
    await check('Operator can find delivery diagnostics and the captured-only email inbox',async()=>{
      const operator=await login('platform@nwfiredemo.com');await operator.page.goto(base+'/app/platform/support');await expect(operator.page.getByRole('heading',{name:'Report delivery operations'})).toBeVisible();await operator.page.getByRole('link',{name:'Staging email inbox'}).click();await expect(operator.page).toHaveURL(/\/support\/mail/);
    });
    await check('Hosted support replies and technician reopening update without manual refresh',async()=>{
      const tech=await login(a.techEmail,true);
      await tech.page.goto(base+'/app/help/new');
      await tech.page.getByLabel('Subject',{exact:true}).fill('Hosted sample verification '+Date.now());
      await tech.page.getByLabel('What happened?',{exact:true}).fill('Synthetic staging check of confirmed replies and reopening. No customer action is required.');
      await tech.page.getByRole('button',{name:'Send request',exact:true}).click();
      await tech.page.waitForURL(/\/app\/help\/(?!new)[^/?]+$/);
      const ticketUrl=tech.page.url();
      for(let n=1;n<=3;n++){
        const text='Hosted verification reply '+n;
        await tech.page.getByLabel('Message',{exact:true}).fill(text);
        await tech.page.getByRole('button',{name:'Send reply',exact:true}).click();
        await expect(tech.page.getByText(text,{exact:true})).toBeVisible();
      }
      const operator=await login('platform@nwfiredemo.com');
      await operator.page.goto(ticketUrl);
      await operator.page.getByRole('button',{name:'Mark resolved',exact:true}).click();
      await expect(operator.page.getByRole('button',{name:'Reopen request',exact:true})).toBeVisible();
      await tech.page.goto(ticketUrl);
      await tech.page.getByRole('button',{name:'Reopen request',exact:true}).click();
      await expect(tech.page.getByRole('button',{name:'Reopen request',exact:true})).toHaveCount(0);
      await operator.page.goto(ticketUrl);
      await operator.page.getByRole('button',{name:'Mark resolved',exact:true}).click();
      await expect(operator.page.getByRole('button',{name:'Reopen request',exact:true})).toBeVisible();
    });
    await check('Local demo password is rejected on hosted staging',async()=>{
      const context=await browser.newContext({extraHTTPHeaders:{'x-vercel-protection-bypass':token}});const csrf=await (await context.request.get(base+'/api/auth/csrf')).json();const response=await context.request.post(base+'/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,email:a.officeEmail,password:'Password123!',callbackUrl:base+'/app'},headers:{'X-Auth-Return-Redirect':'1'}});expect(await response.text()).toMatch(/CredentialsSignin|error/);await context.close();
    });
  } finally {await browser.close();fs.writeFileSync(path.join(__dirname,'results/hosted.json'),JSON.stringify(results,null,2));cleanupTestAccess();}
  fs.writeFileSync(path.join(__dirname,'results/hosted.json'),JSON.stringify(results,null,2));if(results.some(r=>!r.passed))process.exitCode=1;
})().catch(error=>{console.error(error.message.replaceAll(token,'[redacted]'));process.exitCode=1;});
