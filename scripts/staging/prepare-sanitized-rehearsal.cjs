// Explicitly approved read-only source export. No Blob credentials or object requests.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {randomBytes,createHash}=require('node:crypto');
const {PrismaClient}=require('@prisma/client');
const {quote,literal,columnProjection,assembleNodes,jsonNodeQuery,canonical}=require('./sanitize-policy.cjs');
const root=path.resolve(__dirname,'../..');
const bin='C:/Program Files/PostgreSQL/18/bin';
const vercel='C:/Users/Jerem/AppData/Roaming/npm/node_modules/vercel/dist/vc.js';
if(!process.argv.includes('--approved-sanitized-copy'))throw new Error('Sanitized copy approval required.');
const directory=path.join(process.env.LOCALAPPDATA,'TradeWorx','restricted-rehearsal-'+new Date().toISOString().replace(/[:.]/g,'-'));
const password=randomBytes(40).toString('hex'),salt=randomBytes(32).toString('hex');
let stage='initializing',source,target;
function run(command,args,env={},input) {
  const result=spawnSync(command,args,{input,encoding:'utf8',cwd:root,windowsHide:true,stdio:path.basename(command)==='pg_ctl.exe'?'ignore':'pipe',maxBuffer:32*1024*1024,env:{...process.env,...env}});
  if(result.status!==0){fs.writeFileSync(path.join(directory,'command-error.txt'),String(result.stderr||'No command detail'));throw new Error('Command failed during '+stage+' ('+path.basename(command)+')');}
  return result.stdout;
}
function api(endpoint){return JSON.parse(run(process.execPath,[vercel,'api',endpoint,'--scope','nw-fire','--raw']));}
function digest(rows){return createHash('sha256').update(rows.map(canonical).sort().join('\n')).digest('hex');}
const local={PGHOST:'127.0.0.1',PGPORT:'55440',PGUSER:'rehearsal_admin',PGPASSWORD:password,PGDATABASE:'rehearsal'};
(async()=>{
  if(fs.existsSync(directory))throw new Error('Refusing existing destination');
  fs.mkdirSync(directory,{recursive:true});
  const user=run('whoami',[]).trim();
  run('icacls',[directory,'/inheritance:r','/grant:r',user+':(OI)(CI)F','SYSTEM:(OI)(CI)F']);
  const passwordFile=path.join(directory,'cluster-password');fs.writeFileSync(passwordFile,password);
  stage='isolated database creation';
  run(path.join(bin,'initdb.exe'),['-D',path.join(directory,'data'),'-U','rehearsal_admin','--auth=scram-sha-256','--pwfile',passwordFile,'--encoding=UTF8','--locale=C']);
  run(path.join(bin,'pg_ctl.exe'),['-D',path.join(directory,'data'),'-l',path.join(directory,'postgres.log'),'-o','-h 127.0.0.1 -p 55440 -c timezone=UTC','-w','start']);
  run(path.join(bin,'createdb.exe'),['rehearsal'],local);
  const targetUrl=`postgresql://rehearsal_admin:${password}@127.0.0.1:55440/rehearsal`;
  fs.writeFileSync(path.join(directory,'connection.json'),JSON.stringify({url:targetUrl,directory,port:55440,stage:'restricted sanitized copy, not an app deployment'}));
  target=new PrismaClient({datasources:{db:{url:targetUrl}}});
  // This is the newly created, empty loopback-only database, never the source.
  await target.$executeRawUnsafe('DROP SCHEMA public');
  stage='approved source connection';
  const envs=api('/v9/projects/test-worx/env').envs;
  const entry=['DATABASE_URL_UNPOOLED','POSTGRES_URL_NON_POOLING','DIRECT_URL','DATABASE_URL'].map(key=>envs.find(e=>e.key===key&&e.target?.includes('production'))).find(Boolean);
  if(!entry)throw new Error('Missing source connection');
  const url=new URL(api(`/v1/projects/test-worx/env/${entry.id}`).value);
  if(!url.hostname.endsWith('.neon.tech'))throw new Error('Unexpected source');
  const remote={PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:url.pathname.slice(1),PGSSLMODE:'require',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=120000'};
  url.searchParams.set('connection_limit','1');
  source=new PrismaClient({datasources:{db:{url:url.href}}});
  const allowedKeys=new Set(['sections','rows','answers','value','result','status','quantity','count','measurements','data','items','fields','id','customerPortal','reportDrafts','brandedPdf','premiumSupport','advancedRecurrence','uploadedInspectionPdfs']);
  const permissions=fs.readFileSync(path.join(root,'packages/lib/src/team-management-shared.ts'),'utf8').split('export const allowanceKeys')[0];
  for(const match of permissions.matchAll(/"([A-Za-z]+)"/g))allowedKeys.add(match[1]);
  for(const file of fs.readdirSync(path.join(root,'packages/lib/src')).filter(n=>/report.*\.ts$/.test(n))) {
    const text=fs.readFileSync(path.join(root,'packages/lib/src',file),'utf8');
    for(const match of text.matchAll(/(?:key|name|field|repeater):\s*"([A-Za-z_][A-Za-z0-9_]{0,80})"/g))allowedKeys.add(match[1]);
  }
  const evidence={source:'approved read-only production snapshot',destination:'restricted loopback-only PostgreSQL',createdAt:new Date().toISOString(),originalPdfDownloads:0,blobRequests:0,sourceMutations:0,counts:{},sanitizedHashes:{},jsonFields:0};
  await source.$transaction(async tx=>{
    await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await tx.$executeRawUnsafe("SET LOCAL TIME ZONE 'UTC'");
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '120s'");
    const mode=await tx.$queryRawUnsafe('SHOW transaction_read_only');
    if(mode[0].transaction_read_only!=='on')throw new Error('Source is not read-only');
    const snapshot=(await tx.$queryRawUnsafe('SELECT pg_export_snapshot() AS snapshot'))[0].snapshot;
    const columns=await tx.$queryRawUnsafe("SELECT c.table_name,c.column_name,c.data_type,c.udt_name,c.is_nullable FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name) WHERE c.table_schema='public' AND t.table_type='BASE TABLE' ORDER BY c.table_name,c.ordinal_position");
    const relations=await tx.$queryRawUnsafe(`SELECT c.relname AS table_name,a.attname AS column_name FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL unnest(k.conkey) AS key(attnum) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=key.attnum WHERE k.contype='f' AND n.nspname='public'`);
    const relationSet=new Set(relations.map(r=>r.table_name+'.'+r.column_name));
    const tables=[...new Set(columns.map(c=>c.table_name))];
    for(const c of columns)columnProjection(c,relationSet,salt); // Fail closed before any row export.
    stage='schema-only snapshot';
    const schema=path.join(directory,'schema.dump');
    run(path.join(bin,'pg_dump.exe'),['--schema-only','--schema=public','--no-owner','--no-acl','--format=c','--snapshot='+snapshot,'-f',schema],remote);
    const predata=run(path.join(bin,'pg_restore.exe'),['--section=pre-data','--no-owner','--no-acl','-f','-',schema]);
    // Neon-only physical column version metadata has no application semantics.
    const physicalMetadata=/^ALTER TABLE ONLY .+ ALTER COLUMN .+ SET \(pg_attver=\d+\);\r?$/gm;
    evidence.neonPhysicalMetadataOmitted=[...predata.matchAll(physicalMetadata)].length;
    run(path.join(bin,'psql.exe'),['-v','ON_ERROR_STOP=1','-d','rehearsal'],local,predata.replace(physicalMetadata,''));
    for(const table of tables){
      stage='sanitized export '+table;
      const cols=columns.filter(c=>c.table_name===table);
      const rows=await tx.$queryRawUnsafe(`SELECT to_jsonb(s) AS row FROM (SELECT ${cols.map(c=>columnProjection(c,relationSet,salt)).join(',')} FROM ${quote(table)}) s`);
      const safeRows=rows.map(r=>r.row);
      for(const column of cols.filter(c=>['json','jsonb'].includes(c.data_type))){
        const nodes=await tx.$queryRawUnsafe(jsonNodeQuery(table,column.column_name,[...allowedKeys],salt));
        const grouped=new Map();for(const node of nodes){if(!grouped.has(node.id))grouped.set(node.id,[]);grouped.get(node.id).push(node);}
        for(const row of safeRows)if(grouped.has(row.id))row[column.column_name]=assembleNodes(grouped.get(row.id));
        evidence.jsonFields++;
      }
      evidence.counts[table]=safeRows.length;
      evidence.sanitizedHashes[table]=digest(safeRows);
      // Only sanitized values ever reach disk. Preserve an immutable pre-migration baseline.
      fs.writeFileSync(path.join(directory,table+'.json'),JSON.stringify(safeRows));
      for(let offset=0;offset<safeRows.length;offset+=100){
        const batch=JSON.stringify(safeRows.slice(offset,offset+100));
        await target.$executeRawUnsafe(`INSERT INTO ${quote(table)} SELECT * FROM jsonb_populate_recordset(NULL::${quote(table)}, $1::jsonb)`,batch);
      }
      console.log('Sanitized '+table+': '+safeRows.length+' rows');
    }
    fs.writeFileSync(path.join(directory,'columns.json'),JSON.stringify(columns));
    stage='validating restored constraints';
    run(path.join(bin,'pg_restore.exe'),['--section=post-data','--no-owner','--no-acl','--exit-on-error','-d','rehearsal',schema],local);
    evidence.sourceReadOnly=true;
  },{timeout:1200000,maxWait:10000});
  stage='baseline verification';
  for(const table of Object.keys(evidence.counts)){
    const rows=await target.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM ${quote(table)} t`);
    if(rows.length!==evidence.counts[table]||digest(rows.map(r=>r.row))!==evidence.sanitizedHashes[table])throw new Error('Sanitized restore mismatch: '+table);
  }
  evidence.restoreVerified=true;
  fs.writeFileSync(path.join(directory,'evidence.json'),JSON.stringify(evidence,null,2));
  fs.writeFileSync(path.join(root,'.vercel/rehearsal-location.json'),JSON.stringify({directory}));
  console.log(JSON.stringify({directory,tables:Object.keys(evidence.counts).length,rows:Object.values(evidence.counts).reduce((a,b)=>a+b,0),restoreVerified:true,originalPdfDownloads:0}));
})().catch(error=>{fs.writeFileSync(path.join(directory,'failure.txt'),String(error.message));console.error('Sanitized rehearsal stopped safely during: '+stage+'. Restricted partial output was retained for review; no production writes or file downloads were issued.');process.exitCode=1;}).finally(async()=>{await source?.$disconnect();await target?.$disconnect();});
