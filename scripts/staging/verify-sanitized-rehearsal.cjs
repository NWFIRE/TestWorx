const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {quote,canonical}=require('./sanitize-policy.cjs');
const root=path.resolve(__dirname,'../..');
const {directory}=JSON.parse(fs.readFileSync(path.join(root,'.vercel/rehearsal-location.json'),'utf8'));
if(!path.resolve(directory).startsWith(path.resolve(process.env.LOCALAPPDATA,'TradeWorx')+path.sep))throw new Error('Restricted local path required');
const connection=JSON.parse(fs.readFileSync(path.join(directory,'connection.json'),'utf8'));
const url=new URL(connection.url);
if(url.hostname!=='127.0.0.1'||url.port!=='55440'||url.pathname!=='/rehearsal')throw new Error('Restricted local database only');
const db=new PrismaClient({datasources:{db:{url:url.href}}});
const baseline=JSON.parse(fs.readFileSync(path.join(directory,'evidence.json'),'utf8'));
const columns=JSON.parse(fs.readFileSync(path.join(directory,'columns.json'),'utf8'));
const tables=Object.keys(baseline.counts);
const migrations=['20261125180000_subscriber_staging_support','20261125190000_preserve_delivery_audit','20261125200000_signup_shared_rate_limit'];
const result={environment:'restricted sanitized current-business copy',sourceWrites:0,pdfDownloads:0,differences:[],ownershipWarnings:[],maskingWarnings:[],migrations,appliedThisRun:false};
const digest=rows=>createHash('sha256').update(rows.map(canonical).sort().join('\n')).digest('hex');
async function verifyOriginalColumns(label){
  for(const table of tables){
    const names=columns.filter(c=>c.table_name===table).map(c=>quote(c.column_name));
    const rows=await db.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM (SELECT ${names.join(',')} FROM ${quote(table)}) t`);
    if(rows.length!==baseline.counts[table]||digest(rows.map(r=>r.row))!==baseline.sanitizedHashes[table])result.differences.push({phase:label,table});
  }
}
(async()=>{
  await verifyOriginalColumns('before');
  if(result.differences.length)throw new Error('Baseline mismatch, refusing migration');
  const existing=await db.$queryRawUnsafe("SELECT count(*)::int AS count FROM information_schema.columns WHERE table_name='Tenant' AND column_name='subscriptionManaged'");
  if(!existing[0].count){
    for(const migration of migrations){
      const r=spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-v','ON_ERROR_STOP=1','--single-transaction','-f',path.join(root,'packages/db/prisma/migrations',migration,'migration.sql')],{windowsHide:true,encoding:'utf8',env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'55440',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'rehearsal'}});
      if(r.status!==0){fs.writeFileSync(path.join(directory,'migration-error.txt'),r.stderr);throw new Error('Restricted migration failed');}
    }
    result.appliedThisRun=true;
  }
  const deliveryColumns=await db.$queryRawUnsafe("SELECT is_nullable FROM information_schema.columns WHERE table_name='ReportDelivery' AND column_name='attachmentId'");
  const quotaTable=await db.$queryRawUnsafe("SELECT count(*)::int AS count FROM information_schema.tables WHERE table_name='SignupRateLimit' AND table_schema='public'");
  if(deliveryColumns[0]?.is_nullable!=='YES'||quotaTable[0].count!==1)throw new Error('Incomplete migration state; stop for review');
  result.migrationSqlHashes=Object.fromEntries(migrations.map(name=>[name,createHash('sha256').update(fs.readFileSync(path.join(root,'packages/db/prisma/migrations',name,'migration.sql'))).digest('hex')]));
  await verifyOriginalColumns('after');
  const scoped=new Map(tables.map(table=>[table,columns.find(c=>c.table_name===table&&['tenantId','organizationId'].includes(c.column_name))?.column_name]).filter(([,scope])=>scope));
  for(const [table,scope] of scoped){
    const bad=await db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM ${quote(table)} s LEFT JOIN "Tenant" t ON s.${quote(scope)}=t.id WHERE s.${quote(scope)} IS NOT NULL AND t.id IS NULL`);
    if(bad[0].count)result.ownershipWarnings.push({table,kind:'orphaned_company',count:bad[0].count});
  }
  const relations=await db.$queryRawUnsafe(`SELECT s.relname AS source,t.relname AS target,a.attname AS column,b.attname AS referenced FROM pg_constraint k JOIN pg_class s ON s.oid=k.conrelid JOIN pg_class t ON t.oid=k.confrelid JOIN pg_namespace n ON n.oid=s.relnamespace JOIN pg_attribute a ON a.attrelid=s.oid AND a.attnum=k.conkey[1] JOIN pg_attribute b ON b.attrelid=t.oid AND b.attnum=k.confkey[1] WHERE k.contype='f' AND n.nspname='public' AND cardinality(k.conkey)=1`);
  for(const r of relations){
    if(!scoped.has(r.source)||!scoped.has(r.target))continue;
    const bad=await db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM ${quote(r.source)} s JOIN ${quote(r.target)} t ON s.${quote(r.column)}=t.${quote(r.referenced)} WHERE s.${quote(scoped.get(r.source))} IS DISTINCT FROM t.${quote(scoped.get(r.target))}`);
    if(bad[0].count)result.ownershipWarnings.push({table:r.source,relation:r.column,target:r.target,count:bad[0].count});
  }
  result.staffRoles=await db.$queryRawUnsafe('SELECT role,"isActive",count(*)::int AS count FROM "User" GROUP BY role,"isActive" ORDER BY role,"isActive"');
  result.existingCompaniesAutomaticallyEnrolled=(await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM "Tenant" WHERE "subscriptionManaged"=true'))[0].count;
  result.originalPasswordsRemaining=(await db.$queryRawUnsafe('SELECT count(*)::int AS count FROM "User" WHERE "passwordHash" NOT LIKE \'disabled-%\''))[0].count;
  result.scheduleCollisionReview={assessed:false,note:'Service-type text and due-window labels are sanitized. Counts and IDs are preserved, but this copy cannot adjudicate semantic duplicates. No schedules were removed or combined.'};
  result.fileReferences={};
  for(const table of tables){
    const scan=(await db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM ${quote(table)} r WHERE to_jsonb(r)::text ~* '(https?://|data:(image|application)/|sk_(live|test)_)' OR replace(to_jsonb(r)::text,'@example.invalid','') LIKE '%@%'`))[0];
    if(scan.count)result.maskingWarnings.push({table,kind:'external_destination_or_embedded_media_marker',count:scan.count});
  }
  for(const c of columns.filter(c=>/storageKey$|^fileId$/i.test(c.column_name))){
    if(relations.some(r=>r.source===c.table_name&&r.column===c.column_name))continue;
    const row=(await db.$queryRawUnsafe(`SELECT count(*) FILTER(WHERE ${quote(c.column_name)} IS NOT NULL)::int AS count,count(*) FILTER(WHERE ${quote(c.column_name)} IS NOT NULL AND ${quote(c.column_name)} NOT LIKE 'withheld:%')::int AS unsafe FROM ${quote(c.table_name)}`))[0];
    result.fileReferences[c.table_name+'.'+c.column_name]=row.count;
    if(row.unsafe)result.maskingWarnings.push({table:c.table_name,column:c.column_name,count:row.unsafe});
  }
  result.tablesChecked=tables.length;
  result.totalRows=Object.values(baseline.counts).reduce((a,b)=>a+b,0);
  result.passed=!result.differences.length&&!result.maskingWarnings.length&&!result.ownershipWarnings.length&&!result.existingCompaniesAutomaticallyEnrolled&&!result.originalPasswordsRemaining;
  fs.writeFileSync(path.join(directory,'migration-verification.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  if(!result.passed)process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
