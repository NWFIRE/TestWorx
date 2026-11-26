const test=require('node:test'),assert=require('node:assert/strict');
const {columnProjection,assembleNodes,jsonNodeQuery}=require('./sanitize-policy.cjs');
const col=(name,type='text',nullable='YES')=>({table_name:'User',column_name:name,data_type:type,is_nullable:nullable});
test('preserves relationship IDs but never credentials or file contents',()=>{
  assert.match(columnProjection(col('tenantId'),new Set(['User.tenantId']),'salt'),/THEN NULL ELSE "tenantId"/);
  assert.match(columnProjection(col('passwordHash'),new Set(),'salt'),/ELSE NULL END/);
  assert.match(columnProjection(col('storageKey'),new Set(),'salt'),/withheld:/);
  assert.match(columnProjection(col('imageDataUrl'),new Set(),'salt'),/ELSE NULL END/);
  assert.match(columnProjection(col('requiresSignature','boolean','NO'),new Set(),'salt'),/ELSE "requiresSignature"/);
  assert.match(columnProjection(col('contractProfileId'),new Set(),'salt'),/ELSE "contractProfileId"/);
  assert.match(columnProjection(col('quickbooksInvoiceId'),new Set(),'salt'),/ELSE NULL END/);
  assert.throws(()=>columnProjection(col('unknown','xml'),new Set(),'salt'),/Unreviewed/);
});
test('restores structures, zero, false and N/A without prototype mutation',()=>{
  const result=assembleNodes([{path:[],type:'object'},{path:['rows'],type:'array'},{path:['rows','0'],type:'object'},{path:['rows','0','quantity'],type:'number',value:0},{path:['rows','0','answer'],type:'boolean',value:false},{path:['rows','0','result'],type:'string',value:'N/A'},{path:['__proto__'],type:'string',value:'safe'}]);
  assert.equal(result.rows[0].quantity,0);assert.equal(result.rows[0].answer,false);assert.equal(result.rows[0].result,'N/A');assert.equal(Object.getPrototypeOf(result),null);
});
test('JSON projections redact original strings and sensitive numeric values on the source',()=>{
  const sql=jsonNodeQuery('InspectionReport','contentJson',['sections','value'],'salt');
  assert.match(sql,/WHEN private THEN/);assert.match(sql,/\[redacted\]/);assert.match(sql,/ELSE 'field_' \|\| md5/);assert.match(sql,/latitude\|longitude/);
});
