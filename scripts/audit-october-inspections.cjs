require('dotenv').config({path:'.env.runtime.production',quiet:true});
const {PrismaClient}=require('@prisma/client');
const p=new PrismaClient();
async function main(){
 const users=await p.user.findMany({where:{email:{equals:'jeremy@nwfireandsafety.com',mode:'insensitive'}},select:{tenantId:true}});
 if(users.length!==1||!users[0].tenantId)throw Error('Tenant not uniquely identified');
 const tenantId=users[0].tenantId;
 const rows=await p.inspection.findMany({where:{tenantId,scheduledStart:{gte:new Date('2026-10-01T05:00:00Z'),lt:new Date('2026-11-01T05:00:00Z')}},include:{customerCompany:{select:{name:true}},site:{select:{name:true}},tasks:{include:{recurrence:true,report:{select:{status:true,autosaveVersion:true,finalizedAt:true}}}},billingSummary:{select:{status:true,quickbooksInvoiceId:true}},_count:{select:{attachments:true,documents:true,deficiencies:true,jobTimeSessions:true}}}});
 const groups=new Map();for(const r of rows){const key=r.customerCompanyId+'|'+r.siteId;groups.set(key,[...(groups.get(key)||[]),r]);}
 console.log(JSON.stringify({tenantId,total:rows.length,repeatedSites:[...groups.values()].filter(g=>g.length>1).length}));
 for(const group of groups.values()){if(group.length<2)continue; console.log(JSON.stringify({customer:group[0].customerCompany.name,site:group[0].site.name,rows:group.map(r=>({id:r.id,status:r.status,date:r.scheduledStart,created:r.createdAt,notes:r.notes,billing:r.billingSummary,counts:r._count,taskCount:r.tasks.length,tasks:r.tasks.slice(0,12).map(t=>({id:t.id,type:t.inspectionType,schedule:t.serviceScheduleId,series:t.recurrence?.seriesId,frequency:t.recurrence?.frequency,report:t.report}))}))}));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>p.$disconnect());
