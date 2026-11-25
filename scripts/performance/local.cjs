// Deliberately isolated: never load repository/production env files in this worktree.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'../..');
for(const directory of [root,path.join(root,'apps/web')]) {
  for(const file of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local']) {
    if(fs.existsSync(path.join(directory,file))) throw new Error('Use an isolated worktree without environment files.');
  }
}
const database='postgresql://perf@127.0.0.1:55439/tradeworx_perf';
const env={...process.env,DATABASE_URL:database,DIRECT_URL:database,PRISMA_RUNTIME_DATABASE_URL:database,
  DATABASE_URL_UNPOOLED:database,POSTGRES_PRISMA_URL:database,POSTGRES_URL_NON_POOLING:database,
  AUTH_SECRET:'local-performance-only-not-a-production-secret',AUTH_URL:'http://localhost:3339',NEXTAUTH_URL:'http://localhost:3339',APP_URL:'http://localhost:3339',
  STORAGE_DRIVER:'inline',NEXT_TELEMETRY_DISABLED:'1'};
for(const key of Object.keys(env)) if(/^(STRIPE_|RESEND_|QUICKBOOKS_|BLOB_|XERO_|SAGE_|FRESHBOOKS_)/.test(key)) delete env[key];
const mode=process.argv[2];
const cli=(...parts)=>path.join(root,'node_modules',...parts);
let args,cwd=root;
if(mode==='generate'||mode==='migrate') args=[cli('prisma','build','index.js'),...(mode==='generate'?['generate']:['migrate','deploy']),'--schema',path.join(root,'packages/db/prisma/schema.prisma')];
else if(mode==='seed') args=[cli('tsx','dist','cli.mjs'),path.join(root,'packages/db/prisma/seed.ts')];
else if(mode==='scale') args=[path.join(__dirname,'seed-scale.cjs')];
else if(mode==='test-db'){cwd=path.join(root,'packages/lib');args=[cli('vitest','vitest.mjs'),'run','--config','vitest.config.mjs','src/__tests__/postgres.integration.test.ts','--maxWorkers=1'];}
else if(mode==='build'||mode==='start'){cwd=path.join(root,'apps/web');args=[cli('next','dist','bin','next'),mode,...(mode==='start'?['-p','3339','-H','127.0.0.1']:[])];}
else throw new Error('Use generate, migrate, seed, scale, build, start, or test-db');
const result=spawnSync(process.execPath,args,{cwd,env,stdio:'inherit'});
process.exit(result.status??1);
