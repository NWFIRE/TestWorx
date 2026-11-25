const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '../..');
for (const directory of [root, path.join(root, 'apps/web')]) {
  for (const name of fs.readdirSync(directory)) {
    if (/^\.env($|\.(local|production|development|test))/.test(name)) throw new Error('Staging refuses environment files.');
  }
}
const database = 'postgresql://perf@127.0.0.1:55439/tradeworx_subscriber';
const env = {...process.env};
for (const key of Object.keys(env)) if (/^(STRIPE_|RESEND_|QUICKBOOKS_|BLOB_|XERO_|SAGE_|FRESHBOOKS_)/.test(key)) delete env[key];
Object.assign(env, {DATABASE_URL:database,DIRECT_URL:database,PRISMA_RUNTIME_DATABASE_URL:database,
  DATABASE_URL_UNPOOLED:database,POSTGRES_PRISMA_URL:database,POSTGRES_URL_NON_POOLING:database,
  AUTH_SECRET:'isolated-subscriber-staging-only-secret',AUTH_URL:'http://localhost:3340',NEXTAUTH_URL:'http://localhost:3340',APP_URL:'http://localhost:3340',
  APP_ENV:'staging',SUBSCRIBER_FEATURES_ENABLED:'true',NEXT_PUBLIC_SUBSCRIBER_FEATURES_ENABLED:'true',SELF_SIGNUP_ENABLED:'true',EMAIL_DRIVER:'capture',
  STORAGE_DRIVER:'inline',NEXT_TELEMETRY_DISABLED:'1',SUPPORT_EMAIL:'support@example.test'});
if (process.argv.includes('--stripe-test')) {
  if (!process.env.TEST_STRIPE_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Only a Stripe test key is permitted.');
  for (const key of ['SECRET_KEY','PUBLISHABLE_KEY','WEBHOOK_SECRET','PRICE_STARTER','PRICE_PROFESSIONAL']) env['STRIPE_'+key]=process.env['TEST_STRIPE_'+key]||'';
}
const mode = process.argv[2];
const cli = (...parts) => path.join(root, 'node_modules', ...parts);
let args, cwd = root;
if (['generate','migrate','validate'].includes(mode)) args = [cli('prisma','build','index.js'), ...(mode === 'migrate' ? ['migrate','deploy'] : [mode]), '--schema',path.join(root,'packages/db/prisma/schema.prisma')];
else if (mode === 'seed') args = [cli('tsx','dist','cli.mjs'),path.join(root,'packages/db/prisma/seed.ts')];
else if (mode === 'fixture') { cwd = path.join(root,'packages/lib'); args = [cli('vitest','vitest.mjs'),'run','--config','vitest.config.mjs','src/__tests__/subscriber-fixture.staging.test.ts']; }
else if (mode === 'test') { cwd = path.join(root,'packages/lib'); args = [cli('vitest','vitest.mjs'),'run','--config','vitest.config.mjs',...process.argv.slice(3)]; }
else if (mode === 'build' || mode === 'start') {cwd=path.join(root,'apps/web');args=[cli('next','dist','bin','next'),mode,...(mode==='start'?['-p','3340','-H','127.0.0.1']:[])];}
else throw new Error('Use generate, migrate, validate, seed, fixture, test, build, or start.');
const result = spawnSync(process.execPath,args,{cwd,env,stdio:'inherit'});
process.exit(result.status ?? 1);
