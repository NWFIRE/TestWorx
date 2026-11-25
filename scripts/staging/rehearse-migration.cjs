const { PrismaClient, Prisma } = require('@prisma/client');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const database = 'tradeworx_subscriber_rehearsal_v2';
const bin = 'C:/Program Files/PostgreSQL/18/bin';
const run = (tool, args) => { const result = spawnSync(path.join(bin,tool+'.exe'),args,{encoding:'utf8'}); if(result.status !== 0) throw new Error(result.stderr); };
const connection = ['-h','127.0.0.1','-p','55439','-U','perf'];
if (!process.argv.includes('--resume')) run('createdb',[...connection,'-T','tradeworx_perf',database]);
const db = new PrismaClient({datasources:{db:{url:`postgresql://perf@127.0.0.1:55439/${database}`}}});
const quote = name => '"'+name.replaceAll('"','""')+'"';
(async()=>{
  const columns = await db.$queryRawUnsafe(`SELECT c.table_name,c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON c.table_schema=t.table_schema AND c.table_name=t.table_name WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.table_name <> '_prisma_migrations' ORDER BY c.table_name,c.ordinal_position`);
  const tables = new Map();
  for(const column of columns) tables.set(column.table_name,[...(tables.get(column.table_name)||[]),column.column_name]);
  async function snapshot() {
    const result={};
    for(const [table,names] of tables) {
      const rows=await db.$queryRawUnsafe(`SELECT ${names.map(quote).join(',')} FROM ${quote(table)}`);
      const sorted=rows.map(row=>JSON.stringify(row,(_key,value)=>typeof value==='bigint'?value.toString():value)).sort();
      result[table]={count:rows.length,hash:createHash('sha256').update(sorted.join('\n')).digest('hex')};
    }
    return result;
  }
  const before=await snapshot();
  run('psql',[...connection,'-d',database,'-v','ON_ERROR_STOP=1','-f',path.resolve(__dirname,'../../packages/db/prisma/migrations/20261125180000_subscriber_staging_support/migration.sql')]);
  run('psql',[...connection,'-d',database,'-v','ON_ERROR_STOP=1','-f',path.resolve(__dirname,'../../packages/db/prisma/migrations/20261125190000_preserve_delivery_audit/migration.sql')]);
  const after=await snapshot();
  const differences=Object.keys(before).filter(table=>JSON.stringify(before[table])!==JSON.stringify(after[table]));
  const ownership=[];
  for(const [table,names] of tables) {
    if(!names.includes('tenantId'))continue;
    const missing=await db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM ${quote(table)} s LEFT JOIN "Tenant" t ON s."tenantId"=t.id WHERE s."tenantId" IS NOT NULL AND t.id IS NULL`);
    if(missing[0].count)ownership.push({table,kind:'orphaned_tenant',count:missing[0].count});
  }
  const managed=await db.tenant.count({where:{subscriptionManaged:true}});
  for(const model of Prisma.dmmf.datamodel.models) {
    if(!tables.get(model.name)?.includes('tenantId'))continue;
    for(const field of model.fields) {
      if(field.kind!=='object'||field.relationFromFields?.length!==1||!tables.get(field.type)?.includes('tenantId'))continue;
      const bad=await db.$queryRawUnsafe(`SELECT count(*)::int AS count FROM ${quote(model.name)} s JOIN ${quote(field.type)} t ON s.${quote(field.relationFromFields[0])}=t.${quote(field.relationToFields[0])} WHERE s."tenantId" IS DISTINCT FROM t."tenantId"`);
      if(bad[0].count)ownership.push({table:model.name,relation:field.name,kind:'cross_tenant_relationship',count:bad[0].count});
    }
  }
  const result={environment:'local synthetic clone, not production',before,after,differences,ownershipWarnings:ownership,existingCompaniesAutomaticallyEnrolled:managed};
  fs.mkdirSync(path.join(__dirname,'results'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'results/migration-rehearsal.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({tablesChecked:tables.size,differences,ownershipWarnings:ownership,existingCompaniesAutomaticallyEnrolled:managed}));
  if(differences.length||ownership.length||managed)process.exitCode=1;
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
