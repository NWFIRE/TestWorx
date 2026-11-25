const {PrismaClient}=require('@prisma/client');
const fs=require('node:fs');const path=require('node:path');
const url=new URL(process.env.DATABASE_URL||'');
if(url.hostname!=='127.0.0.1'||url.port!=='55439'||url.pathname!=='/tradeworx_perf') throw new Error('Local performance database only');
const db=new PrismaClient();
async function main(){
  if(await db.customerCompany.count({where:{id:{startsWith:'perf-'}}})) throw new Error('Scale fixture already exists. Do not append another dataset.');
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(new Date());
  const manifest={day,companies:[]};
  for(const [index,slug] of ['evergreen-fire','northshore-life-safety'].entries()){
    const tenant=await db.tenant.findUniqueOrThrow({where:{slug}});
    const office=await db.user.findFirstOrThrow({where:{tenantId:tenant.id,role:{in:['office_admin','tenant_admin']}}});
    const tech=await db.user.findFirstOrThrow({where:{tenantId:tenant.id,role:'technician'},orderBy:{email:'asc'}});
    const sample=await db.inspectionReport.findFirst({where:{tenantId:tenant.id,task:{inspectionType:'fire_extinguisher'}}});
    const customers=[],sites=[],jobs=[],tasks=[],reports=[],assignments=[];
    for(let i=0;i<300;i++){
      const c=`perf-${index}-c-${i}`,s=`perf-${index}-s-${i}`;
      customers.push({id:c,tenantId:tenant.id,name:`Subscriber Customer ${String(i).padStart(4,'0')}`,contactEmails:`customer${i}@company${index}.test`});
      sites.push({id:s,tenantId:tenant.id,customerCompanyId:c,name:`Property ${i}`,addressLine1:`${100+i} Main Street`,city:'Chicago',state:'IL',postalCode:'60601'});
      for(let j=0;j<4;j++){
        const id=`perf-${index}-i-${i}-${j}`,task=`${id}-task`,completed=j===3;
        const scheduled=new Date(`${day}T15:00:00Z`);scheduled.setUTCDate(scheduled.getUTCDate()+(j===0?i%15:j*30));
        const assigned=i%3===0?null:tech.id;
        jobs.push({id,tenantId:tenant.id,customerCompanyId:c,siteId:s,createdByUserId:office.id,assignedTechnicianId:assigned,
          scheduledStart:scheduled,scheduledEnd:new Date(+scheduled+3600000),status:completed?'completed':'to_be_completed',completedAt:completed?scheduled:null,claimable:!assigned});
        tasks.push({id:task,tenantId:tenant.id,inspectionId:id,inspectionType:'fire_extinguisher',assignedTechnicianId:assigned,dueMonth:scheduled.toISOString().slice(0,7),status:completed?'completed':'to_be_completed',schedulingStatus:completed?'completed':'scheduled_now'});
        reports.push({id:`${id}-report`,tenantId:tenant.id,inspectionId:id,inspectionTaskId:task,technicianId:assigned,status:completed?'finalized':'draft',contentJson:sample?.contentJson||{}});
        if(assigned) assignments.push({tenantId:tenant.id,inspectionId:id,technicianId:assigned});
      }
    }
    await db.customerCompany.createMany({data:customers});await db.site.createMany({data:sites});
    await db.inspection.createMany({data:jobs});await db.inspectionTask.createMany({data:tasks});
    await db.inspectionReport.createMany({data:reports});await db.inspectionTechnicianAssignment.createMany({data:assignments});
    manifest.companies.push({tenantId:tenant.id,officeEmail:office.email,techEmail:tech.email,customerId:customers[1].id,inspectionId:jobs[4].id,taskId:tasks[4].id,reportId:reports[4].id});
  }
  fs.mkdirSync(path.join(__dirname,'results'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'results','fixture.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({customers:await db.customerCompany.count(),inspections:await db.inspection.count(),reports:await db.inspectionReport.count(),day}));
}
main().finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});
