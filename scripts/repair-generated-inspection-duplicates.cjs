// Dry-run by default. Repairs only untouched, system-generated duplicate visits.
require('dotenv').config({path:'.env.runtime.production',quiet:true});
const {PrismaClient,Prisma}=require('@prisma/client');
const crypto=require('node:crypto');
const p=new PrismaClient();
const countSelect={attachments:true,documents:true,deficiencies:true,jobTimeSessions:true,workOrderLineItems:true,amendments:true,replacementAmendments:true,convertedFromQuotes:true,createdFromCloseoutRequests:true};
const include={customerCompany:{select:{name:true}},tasks:{include:{recurrence:true,report:{include:{_count:{select:{attachments:true,signatures:true,deficiencies:true,correctionEvents:true}}}}}},technicianAssignments:true,billingSummary:true,closeoutRequest:true,_count:{select:countSelect}};
function taskKey(t){return JSON.stringify([t.inspectionType,t.customDisplayLabel||'',t.recurrence?.frequency||'',t.recurrence?.intervalCount||1]);}
function emptyReport(r){return !r||(r.status==='draft'&&r.autosaveVersion===1&&!r.finalizedAt&&!r.technicianId&&r.correctionState==='none'&&Object.values(r._count).every(n=>n===0)&&(r.contentJson===null||JSON.stringify(r.contentJson)==='{"narrative":""}'));}
function untouched(r){return ['to_be_completed','scheduled'].includes(r.status)&&!r.completedAt&&!r.archivedAt&&!r.assignedTechnicianId&&!r.notes&&!r.isPriority&&!r.providerContextId&&r.sourceType==='direct'&&!r.billingSummary&&!r.closeoutRequest&&!r.technicianAssignments.length&&Object.values(r._count).every(n=>n===0)&&r.tasks.length>0&&r.tasks.length<=10&&r.tasks.every(t=>!t.notes&&!t.addedByUserId&&!t.assignedTechnicianId&&['to_be_completed','scheduled'].includes(t.status)&&emptyReport(t.report));}
function covers(keep,drop){const counts=new Map();for(const t of keep.tasks)counts.set(taskKey(t),(counts.get(taskKey(t))||0)+1);for(const t of drop.tasks){const k=taskKey(t);if(!(counts.get(k)>0))return false;counts.set(k,counts.get(k)-1);}return true;}
function plan(rows,generated){
 const groups=new Map();for(const r of rows){const key=JSON.stringify([r.tenantId,r.customerCompanyId,r.siteId,r.scheduledStart.toISOString(),r.inspectionClassification]);groups.set(key,[...(groups.get(key)||[]),r]);}
 const pairs=[];
 for(const group of groups.values()){
   group.sort((a,b)=>Number(untouched(a))-Number(untouched(b))||b.tasks.length-a.tasks.length||a.createdAt-b.createdAt||a.id.localeCompare(b.id));
   const kept=[];
   for(const r of group){const canonical=kept.find(k=>covers(k,r));if(canonical&&untouched(r)&&generated.has(r.id))pairs.push({keep:canonical,drop:r});else kept.push(r);}
 }
 return pairs;
}
async function main(){
 const email=process.argv.find(arg=>arg.startsWith('--email='))?.slice(8);
 if(!email)throw Error('Supply --email=administrator-email to resolve the authorized tenant.');
 const users=await p.user.findMany({where:{email:{equals:email,mode:'insensitive'},isActive:true,role:{in:['office_admin','tenant_admin']}},select:{id:true,tenantId:true}});
 if(users.length!==1||!users[0].tenantId)throw Error('Administrator/tenant not uniquely identified');
 const {tenantId,id:actorUserId}=users[0];
 const rows=await p.inspection.findMany({where:{tenantId,status:{not:'cancelled'}},include});
 const logs=await p.auditLog.findMany({where:{tenantId,action:'inspection.service_schedule_generated'},select:{entityId:true}});
 const generated=new Set(logs.map(l=>l.entityId));const pairs=plan(rows,generated);
 const digest=crypto.createHash('sha256').update(JSON.stringify(pairs.map(x=>[x.keep.id,x.drop.id,x.drop.updatedAt]))).digest('hex');
 console.log(JSON.stringify({mode:'dry-run',count:pairs.length,approvalDigest:digest,byMonth:pairs.reduce((m,x)=>{const k=x.drop.scheduledStart.toISOString().slice(0,7);m[k]=(m[k]||0)+1;return m;},{}),customers:[...new Set(pairs.map(x=>x.drop.customerCompany.name))]}));
 if(!process.argv.includes('--apply'))return;
 if(!process.argv.includes('--digest='+digest))throw Error('Dry-run digest required; records changed or approval does not match.');
 // One transaction: retained visits survive, exact snapshots remain in the audit log.
 await p.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`schedule-backfill:${tenantId}`}, 0))`;
  const duplicateScheduleIds=new Set();const keptScheduleIds=new Set();
  const allIds=[...new Set(pairs.flatMap(x=>[x.keep.id,x.drop.id]))];
  const dropIds=pairs.map(x=>x.drop.id);
  if(!allIds.length)return;
  for(const occurrenceKey of [...new Set(pairs.map(({drop})=>[tenantId,drop.customerCompanyId,drop.siteId,drop.scheduledStart.toISOString().slice(0,7)].join('\u001f')))].sort()){
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${occurrenceKey}, 0))`;
  }
  await tx.$executeRaw`SELECT id FROM "Inspection" WHERE "tenantId"=${tenantId} AND id IN (${Prisma.join(allIds)}) ORDER BY id FOR UPDATE`;
  await tx.$executeRaw`SELECT id FROM "InspectionReport" WHERE "tenantId"=${tenantId} AND "inspectionId" IN (${Prisma.join(dropIds)}) ORDER BY id FOR UPDATE`;
  const currentRows=await tx.inspection.findMany({where:{tenantId,id:{in:allIds}},include});
  const byId=new Map(currentRows.map(r=>[r.id,r]));const auditEntries=[];const reportIds=[];const taskIds=[];
  for(const {keep,drop} of pairs){
   const current=byId.get(drop.id);const retained=byId.get(keep.id);
   if(!current||!retained||!untouched(current)||!covers(retained,current)||JSON.stringify(current)!==JSON.stringify(drop)||JSON.stringify(retained)!==JSON.stringify(keep))throw Error('Inspection changed during review; nothing repaired.');
   for(const t of retained.tasks)if(t.serviceScheduleId)keptScheduleIds.add(t.serviceScheduleId);
   for(const t of current.tasks)if(t.serviceScheduleId)duplicateScheduleIds.add(t.serviceScheduleId);
   const snapshot=JSON.parse(JSON.stringify(current));
   auditEntries.push({tenantId,actorUserId,entityType:'Inspection',entityId:current.id,action:'inspection.duplicate_repaired',metadata:{retainedInspectionId:keep.id,snapshot,reason:'Untouched generated visit covered by retained visit at identical customer, site, time and service multiplicities'}});
   reportIds.push(...current.tasks.flatMap(t=>t.report?[t.report.id]:[]));
   taskIds.push(...current.tasks.map(t=>t.id));
  }
  await tx.auditLog.createMany({data:auditEntries});
  await tx.inspectionReport.deleteMany({where:{tenantId,id:{in:reportIds}}});
  await tx.inspectionRecurrence.deleteMany({where:{tenantId,inspectionTaskId:{in:taskIds}}});
  await tx.inspectionTask.deleteMany({where:{tenantId,id:{in:taskIds}}});
  await tx.inspection.deleteMany({where:{tenantId,id:{in:dropIds}}});
  const schedules=await tx.serviceSchedule.findMany({where:{tenantId,id:{in:[...duplicateScheduleIds].filter(id=>!keptScheduleIds.has(id))},isActive:true,tasks:{none:{}}}});
  if(schedules.length){
   await tx.auditLog.createMany({data:schedules.map(schedule=>({tenantId,actorUserId,entityType:'ServiceSchedule',entityId:schedule.id,action:'service_schedule.duplicate_deactivated',metadata:{snapshot:JSON.parse(JSON.stringify(schedule))}}))});
   await tx.serviceSchedule.updateMany({where:{tenantId,id:{in:schedules.map(s=>s.id)}},data:{isActive:false}});
  }
 },{timeout:120000});
 console.log(JSON.stringify({repaired:pairs.length,remaining:(await p.inspection.findMany({where:{tenantId,scheduledStart:{gte:new Date('2026-10-01T05:00:00Z'),lt:new Date('2026-11-01T05:00:00Z')}},select:{id:true}})).length}));
}
module.exports={plan,untouched,covers,emptyReport};
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
