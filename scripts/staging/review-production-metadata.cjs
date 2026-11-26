// Requires explicit approval. Reads catalog/file metadata only, never customer rows or object bytes.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {PrismaClient}=require('@prisma/client');
const {list}=require('@vercel/blob');
if(!process.argv.includes('--approved-read-only'))throw new Error('Explicit read-only production metadata approval is required.');
const root=path.resolve(__dirname,'../..');
function api(endpoint){
  const r=spawnSync(process.execPath,['C:/Users/Jerem/AppData/Roaming/npm/node_modules/vercel/dist/vc.js','api',endpoint,'--scope','nw-fire','--raw'],{cwd:root,encoding:'utf8'});
  if(r.status!==0)throw new Error('Read-only metadata request failed; credentials withheld.');
  return JSON.parse(r.stdout);
}
(async()=>{
  const envs=api('/v9/projects/test-worx/env').envs;
  function secret(keys){const entry=keys.map(key=>envs.find(e=>e.key===key&&e.target?.includes('production'))).find(Boolean);if(!entry)throw new Error('Required production metadata connection is not configured.');return api(`/v1/projects/test-worx/env/${entry.id}`).value;}
  const connection=secret(['DATABASE_URL_UNPOOLED','POSTGRES_URL_NON_POOLING','DIRECT_URL','DATABASE_URL']);
  const url=new URL(connection);if(!url.hostname.endsWith('.neon.tech'))throw new Error('Unexpected database provider; stop for review.');
  url.searchParams.set('connection_limit','1');url.searchParams.set('connect_timeout','10');
  const db=new PrismaClient({datasources:{db:{url:url.href}}});
  let schema;
  try {
    schema=await db.$transaction(async tx=>{
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '10s'");
      const readOnly=await tx.$queryRawUnsafe('SHOW transaction_read_only');
      if(readOnly[0]?.transaction_read_only!=='on')throw new Error('Read-only transaction not enforced.');
      const columns=await tx.$queryRaw`SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`;
      const constraints=await tx.$queryRaw`SELECT c.relname AS table_name,con.conname AS name,con.contype AS type,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,con.conname`;
      return {readOnly:true,columns,constraints};
    },{timeout:20000});
  } finally {await db.$disconnect();}
  fs.writeFileSync(path.join(root,'.vercel/production-schema-metadata.json'),JSON.stringify(schema,null,2));
  const token=secret(['BLOB_READ_WRITE_TOKEN']);
  const objects=[];let cursor,complete=false;
  for(let page=0;page<100;page++){
    const batch=await list({token,limit:1000,cursor});
    objects.push(...batch.blobs.map(({pathname,size,uploadedAt})=>({pathname,size,uploadedAt})));
    if(!batch.hasMore){complete=true;break;}cursor=batch.cursor;
  }
  fs.writeFileSync(path.join(root,'.vercel/production-file-metadata.json'),JSON.stringify({complete,objects},null,2));
  const summary={readOnly:true,provider:'Neon',tables:new Set(schema.columns.map(c=>c.table_name)).size,columns:schema.columns.length,constraints:schema.constraints.length,blobObjects:objects.length,blobBytes:objects.reduce((sum,o)=>sum+o.size,0),manifestComplete:complete,customerRowsRead:0,pdfContentsDownloaded:0};
  fs.writeFileSync(path.join(__dirname,'results/production-metadata-summary.json'),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary));
})().catch(()=>{console.error('Metadata review did not finish. No mutation or file-content request was issued; inspect credentials/access privately.');process.exitCode=1;});
