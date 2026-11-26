const quote = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => "'" + value.replaceAll("'", "''") + "'";
const sensitive = /password|token|secret|latitude|longitude|signature|imageData|stripe|quickbooks|qbItem|qbSync|incomeAccount|licenseNumber/i;
const fileReference = /storageKey$|^fileId$/i;
const disabled = new Set(['autoBillingEnabled','remindersEnabled','customerIntakeAutoCreateEnabled','isOfflineEligible']);
const safeValues = ['yes','no','n/a','na','pass','fail','passed','failed','pending','completed','finalized','draft','open','closed','active','inactive','not_started','in_progress','not_applicable','true','false','service','material','labor','fee','monthly','quarterly','semiannual','annual','biennial','one_time','starter','professional','enterprise','trial','paid','unpaid','sent','not_sent','approved','declined','ready_to_bill','invoiced','billing_review'];

function columnProjection(column, relations, salt) {
  const {table_name: table, column_name: name, data_type: type, udt_name: udt, is_nullable: nullable} = column;
  const q=quote(name), tag=`md5(${literal(salt+':'+table+':'+name+':')} || "id"::text)`;
  let expression;
  if (table === '_prisma_migrations' && ['id','checksum','migration_name'].includes(name)) expression=q;
  else if (name==='id' || relations.has(table+'.'+name) || ['seriesId','sourceEntityId','entityId','relatedEntityId'].includes(name)) expression=q;
  else if (fileReference.test(name)) expression=`'withheld:' || md5(${literal(salt)} || ${q})`;
  else if (disabled.has(name)) expression='false';
  else if (type==='boolean') expression=q;
  else if (sensitive.test(name)) expression=nullable==='YES'?'NULL':`'disabled-' || ${tag}`;
  else if (/Id$/.test(name) && name!=='fileId') expression=q;
  else if (type==='jsonb' || type==='json') expression=`'null'::jsonb`;
  else if (type==='USER-DEFINED' || ['boolean','integer','bigint','smallint','numeric','double precision','real','timestamp without time zone','timestamp with time zone','date'].includes(type)) expression=q;
  else if (type==='ARRAY') expression=udt.startsWith('_') && !['_text','_varchar'].includes(udt)?q:`ARRAY(SELECT CASE WHEN lower(v) IN (${safeValues.map(literal).join(',')}) THEN v ELSE '[redacted]' END FROM unnest(${q}) v)`;
  else if (type==='bytea') expression=`decode('', 'hex')`;
  else if (type==='text' || type==='character varying') {
    if (/email/i.test(name)) expression=`'sample-' || ${tag} || '@example.invalid'`;
    else if (/phone/i.test(name)) expression="'202-555-0100'";
    else if (['reportNumber','quoteNumber'].includes(name)) expression=`CASE WHEN ${q} ~ '^[A-Za-z0-9-]{1,40}$' THEN ${q} ELSE 'sample-' || ${tag} END`;
    else if (name==='assetTag') expression=`'sample-' || ${tag}`;
    else if (['status','code','action','entityType','type','source','sourceType','provider','kind','category','role','frequency','cadence','timezone','paymentTermsCode'].includes(name)) expression=`CASE WHEN lower(${q}) IN (${safeValues.concat(['america/chicago']).map(literal).join(',')}) THEN ${q} ELSE 'sample-' || ${tag} END`;
    else expression=`'Sample ' || ${tag}`;
  } else throw new Error('Unreviewed column type: '+table+'.'+name+':'+type);
  return `CASE WHEN ${q} IS NULL THEN NULL ELSE ${expression} END AS ${q}`;
}

// Construct only sanitized JSON nodes returned by PostgreSQL, never original text/media.
function assembleNodes(nodes) {
  let root=null;
  for(const {path,type,value} of nodes.sort((a,b)=>a.path.length-b.path.length)) {
    const item=type==='object'?Object.create(null):type==='array'?[]:value;
    if (!path.length) {root=item;continue;}
    let parent=root;
    for(const key of path.slice(0,-1)) parent=parent[key];
    Object.defineProperty(parent,path.at(-1),{value:item,enumerable:true,writable:true,configurable:true});
  }
  return root;
}

function jsonNodeQuery(table, column, allowedKeys, salt) {
  const allowed=allowedKeys.map(literal).join(',');
  const safe=safeValues.map(literal).join(',');
  return `WITH RECURSIVE tree AS (
    SELECT id, ARRAY[]::text[] AS path, ${quote(column)}::jsonb AS node, false AS private
    FROM ${quote(table)} WHERE ${quote(column)} IS NOT NULL
    UNION ALL
    SELECT t.id, t.path || e.key, e.value,
      t.private OR (e.raw_key <> '' AND e.raw_key NOT IN (${allowed})) OR e.raw_key ~* 'name|address|email|phone|serial|license|token|secret|password|signature|photo|image|latitude|longitude|coordinate|location|notes|description|comment|url|id$'
    FROM tree t CROSS JOIN LATERAL (
      SELECT CASE WHEN k IN (${allowed}) THEN k ELSE 'field_' || md5(${literal(salt)} || k) END AS key, k AS raw_key, v AS value
      FROM jsonb_each(CASE WHEN jsonb_typeof(t.node)='object' THEN t.node ELSE '{}'::jsonb END) AS obj(k,v)
      UNION ALL
      SELECT (n-1)::text, '', v FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.node)='array' THEN t.node ELSE '[]'::jsonb END) WITH ORDINALITY AS arr(v,n)
    ) e
  ) SELECT id,path,jsonb_typeof(node) AS type,
    CASE WHEN jsonb_typeof(node) IN ('object','array','null') THEN 'null'::jsonb
      WHEN private THEN '"[redacted]"'::jsonb
      WHEN jsonb_typeof(node) IN ('boolean','number') THEN node
      WHEN lower(node #>> '{}') IN (${safe}) THEN node
      ELSE '"[redacted]"'::jsonb END AS value FROM tree`;
}
function canonical(value){return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
module.exports={quote,literal,columnProjection,assembleNodes,jsonNodeQuery,safeValues,canonical};
