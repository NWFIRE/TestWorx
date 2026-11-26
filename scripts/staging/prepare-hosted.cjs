// One-time bootstrap of the explicitly created sandbox. Never reads production.
const fs = require('node:fs'), path = require('node:path');
const {spawnSync} = require('node:child_process');
const {randomBytes} = require('node:crypto');
const {PrismaClient} = require('@prisma/client');
const {hash} = require('bcryptjs');
const root = path.resolve(__dirname,'../..');
const project = JSON.parse(fs.readFileSync(path.join(root,'.vercel/project.json'),'utf8'));
if(project.projectId !== 'prj_su2r87mUde6ttMAREVbUrpBZgwFl') throw new Error('Not the approved empty sandbox project.');
const values = {};
for(const line of fs.readFileSync(path.join(root,'.vercel/sandbox.env'),'utf8').split(/\r?\n/)) {
  const match=line.match(/^([A-Z_]+)=(.*)$/); if(match) values[match[1]]=match[2].startsWith('"')?JSON.parse(match[2]):match[2];
}
const destination=values.DATABASE_URL_UNPOOLED || values.POSTGRES_URL_NON_POOLING;
if(!destination || !new URL(destination).hostname.endsWith('.neon.tech')) throw new Error('New sandbox Neon connection required.');
const target=new PrismaClient({datasources:{db:{url:destination}}});
const bin='C:/Program Files/PostgreSQL/18/bin';
const vercel='C:/Users/Jerem/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
function run(command,args,options={}) {
  const result=spawnSync(command,args,{cwd:root,encoding:'utf8',...options});
  if(result.status!==0) {
    let detail=String(result.stderr || result.error || 'No error detail');
    for(const value of Object.values(values)) if(value) detail=detail.replaceAll(value,'[redacted]');
    if(fs.existsSync(path.join(root,'.vercel/sandbox-config.json'))) for(const value of Object.values(JSON.parse(fs.readFileSync(path.join(root,'.vercel/sandbox-config.json'),'utf8')))) if(value) detail=detail.replaceAll(value,'[redacted]');
    throw new Error(`Sandbox bootstrap command failed: ${path.basename(command)}: ${detail}`);
  }
  return result;
}
(async()=>{
  if(process.argv.includes('--configure-only')) {
    const config=JSON.parse(fs.readFileSync(path.join(root,'.vercel/sandbox-config.json'),'utf8'));
    const payload=Object.entries(config).map(([key,value])=>({key,value,type:'encrypted',target:['preview']}));
    for(const entry of payload) {
      const file=path.join(root,'.vercel/env-payload.json'); fs.writeFileSync(file,JSON.stringify(entry));
      run(process.execPath,[vercel,'api','/v10/projects/tradeworx-subscriber-sandbox/env?upsert=true','-X','POST','--input',file,'--silent','--scope','nw-fire']);
    }
    console.log('Saved sandbox configuration applied to Preview only.'); return;
  }
  const tables=await target.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public'`;
  if(tables.length) throw new Error('Refusing to overwrite a nonempty hosted database.');
  const dump=path.join(root,'.vercel/synthetic.dump');
  run(path.join(bin,'pg_dump.exe'),['-h','127.0.0.1','-p','55439','-U','perf','-d','tradeworx_subscriber','--format=c','--no-owner','--no-acl','-f',dump]);
  run(path.join(bin,'pg_restore.exe'),['--no-owner','--no-acl','--exit-on-error','-d',destination,dump]);
  const accounts=[];
  for(const user of await target.user.findMany({select:{id:true,email:true,role:true}})) {
    const password=randomBytes(24).toString('base64url');
    await target.user.update({where:{id:user.id},data:{passwordHash:await hash(password,12)}});
    if(['tenantadmin@evergreenfire.com','tech1@evergreenfire.com','admin@northshorelife.com','tech@northshorelife.com','platform@nwfiredemo.com'].includes(user.email)) accounts.push({email:user.email,role:user.role,password});
  }
  await target.capturedEmail.deleteMany();
  await target.workspaceSignup.deleteMany();
  await target.accountInvitation.deleteMany();
  await target.passwordResetToken.deleteMany();
  await target.$executeRaw`DELETE FROM "SignupRateLimit"`;
  const config={APP_ENV:'staging',APP_URL:'https://tradeworx-subscriber-sandbox.vercel.app',AUTH_URL:'https://tradeworx-subscriber-sandbox.vercel.app',NEXTAUTH_URL:'https://tradeworx-subscriber-sandbox.vercel.app',AUTH_SECRET:randomBytes(48).toString('base64url'),DIRECT_URL:destination,EMAIL_DRIVER:'capture',STORAGE_DRIVER:'inline',SUBSCRIBER_FEATURES_ENABLED:'true',NEXT_PUBLIC_SUBSCRIBER_FEATURES_ENABLED:'true',SELF_SIGNUP_ENABLED:'true',SUPPORT_EMAIL:'support@example.test'};
  fs.writeFileSync(path.join(root,'.vercel/sandbox-accounts.json'),JSON.stringify(accounts,null,2));
  fs.writeFileSync(path.join(root,'.vercel/sandbox-config.json'),JSON.stringify(config));
  const payload=Object.entries(config).map(([key,value])=>({key,value,type:'encrypted',target:['preview']}));
  for(const entry of payload) {
    const file=path.join(root,'.vercel/env-payload.json'); fs.writeFileSync(file,JSON.stringify(entry));
    run(process.execPath,[vercel,'api','/v10/projects/tradeworx-subscriber-sandbox/env?upsert=true','-X','POST','--input',file,'--silent','--scope','nw-fire']);
  }
  console.log('Synthetic database copied to the new sandbox; credentials rotated. Private account file is in .vercel. Preview-only configuration applied.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>target.$disconnect());
