const fs=require('node:fs'),path=require('node:path'),{PrismaClient}=require('@prisma/client');
const {quote,canonical}=require('./sanitize-policy.cjs');
const parent=path.join(process.env.LOCALAPPDATA,'TradeWorx');
const directory=path.join(parent,fs.readdirSync(parent).filter(n=>n.startsWith('restricted-rehearsal-')).sort().at(-1));
const {url}=JSON.parse(fs.readFileSync(path.join(directory,'connection.json'),'utf8'));
if(new URL(url).hostname!=='127.0.0.1'||new URL(url).port!=='55440')throw new Error('Local copy only');
const db=new PrismaClient({datasources:{db:{url}}});
(async()=>{
  const columns=JSON.parse(fs.readFileSync(path.join(directory,'columns.json'),'utf8'));
  for(const table of [...new Set(columns.map(c=>c.table_name))]){
    const expected=JSON.parse(fs.readFileSync(path.join(directory,table+'.json'),'utf8'));
    const rows=await db.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM ${quote(table)} t`);
    const byId=new Map(rows.map(r=>[r.row.id,r.row]));
    const differences={};
    for(const row of expected){const actual=byId.get(row.id);if(!actual){differences.missing=(differences.missing||0)+1;continue;}for(const key of Object.keys(row))if(canonical(row[key])!==canonical(actual[key]))differences[key]=(differences[key]||0)+1;}
    if(Object.keys(differences).length)console.log(JSON.stringify({table,differences}));
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.$disconnect());
