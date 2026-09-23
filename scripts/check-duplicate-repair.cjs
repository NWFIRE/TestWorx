const assert=require('node:assert/strict');
const {plan,untouched}=require('./repair-generated-inspection-duplicates.cjs');
function visit(id,overrides={}){return {id,tenantId:'tenant',customerCompanyId:'customer',siteId:'site',scheduledStart:new Date('2026-10-01T09:00:00Z'),createdAt:new Date('2026-05-01'),status:'to_be_completed',sourceType:'direct',inspectionClassification:'standard',technicianAssignments:[],_count:{documents:0,attachments:0},tasks:[{inspectionType:'kitchen_suppression',status:'to_be_completed',recurrence:{frequency:'SEMI_ANNUAL'},report:{status:'draft',autosaveVersion:1,correctionState:'none',contentJson:{narrative:''},_count:{signatures:0}}}],...overrides};}
const a=visit('a'),b=visit('b');
assert.equal(plan([a,b],new Set(['a','b'])).length,1);
assert.equal(plan([a,b],new Set()).length,0);
for(const change of [{siteId:'other'},{scheduledStart:new Date('2026-10-02')},{inspectionClassification:'call_in'}])assert.equal(plan([a,visit('b',change)],new Set(['b'])).length,0);
for(const change of [{notes:'Keep me'},{billingSummary:{}},{status:'completed'},{assignedTechnicianId:'tech'},{_count:{documents:1}}])assert.equal(untouched(visit('b',change)),false);
const started=visit('b',{tasks:[{...b.tasks[0],report:{...b.tasks[0].report,autosaveVersion:2}}]});assert.equal(untouched(started),false);
const complete=visit('done',{status:'invoiced',billingSummary:{status:'invoiced'}});
const assigned=visit('assigned',{assignedTechnicianId:'tech',tasks:[{...a.tasks[0],assignedTechnicianId:'tech'}]});
assert.equal(plan([a,assigned],new Set(['a']))[0].keep.id,'assigned');
assert.equal(plan([a,complete],new Set(['a']))[0].keep.id,'done');
const multi=visit('multi',{tasks:[...a.tasks,...a.tasks]});assert.equal(plan([a,multi],new Set(['a','multi']))[0].keep.id,'multi');
const different=visit('different',{tasks:[{...a.tasks[0],customDisplayLabel:'Second hood'}]});assert.equal(plan([a,different],new Set(['a','different'])).length,0);
console.log('PASS: generated-only repair, tenant/site/date scope, completed/billed/edited/assigned protection, service multiplicities and custom labels.');
