const {PrismaClient}=require('@prisma/client');
const assert=require('node:assert/strict');
const {jsonNodeQuery,assembleNodes}=require('./sanitize-policy.cjs');
const db=new PrismaClient({datasources:{db:{url:'postgresql://perf@127.0.0.1:55439/tradeworx_subscriber'}}});
(async()=>{
  const fixture={rows:[{quantity:0,answer:false,result:'N/A',name:'PRIVATE PERSON',latitude:36.4,pdf:'data:application/pdf;base64,PRIVATEPDF',notes:'PRIVATE FINDING'}]};
  const sql=jsonNodeQuery('Fixture','contentJson',['rows','quantity','answer','result','name','latitude','pdf','notes'],'test-salt').replace('FROM "Fixture"',`FROM (SELECT 'fixture' AS id, $1::jsonb AS "contentJson") fixture`);
  const nodes=await db.$queryRawUnsafe(sql,JSON.stringify(fixture));
  const serialized=JSON.stringify(nodes);
  assert(!serialized.includes('PRIVATE'));assert(!serialized.includes('36.4'));
  const result=assembleNodes(nodes);
  assert.equal(result.rows[0].quantity,0);assert.equal(result.rows[0].answer,false);assert.equal(result.rows[0].result,'N/A');
  assert.equal(result.rows[0].name,'[redacted]');assert.equal(result.rows[0].latitude,'[redacted]');
  console.log('Source-side sanitizer passed live PostgreSQL fixture: original text/media absent, zero/false/N/A preserved. No source tables read or written.');
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
