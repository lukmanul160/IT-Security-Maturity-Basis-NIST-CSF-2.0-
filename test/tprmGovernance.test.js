const test=require('node:test'),assert=require('node:assert/strict');
const governance=require('../src/services/tprmGovernanceService');
test('review intervals and reminders use criticality, residual risk and assigned escalation owners',()=>{
 assert.equal(governance.reviewPolicy({tier:'Tier 1 (Critical)',residual:10},'2026-01-01').latestDate,'2026-04-01');
 assert.equal(governance.reviewPolicy({tier:'Tier 2 (Important)',residual:10}).days,180);
 assert.equal(governance.reviewPolicy({tier:'Tier 3 (Standard)',residual:10}).days,365);
 assert.equal(governance.reviewPolicy({tier:'Tier 3 (Standard)',residual:75}).days,90);
 const value=governance.reminders({relationship_status:'Active',next_review:'2000-01-01'},{assignments:{reviewer:'reviewer',approver:'approver'},conditions:[]},{tier:'Tier 1 (Critical)',residual:10});
 assert.equal(value.reminders[0].assignee,'reviewer');assert.equal(value.reminders[0].escalateTo,'approver');assert.equal(value.reminders[0].severity,'Overdue');
 assert.equal(governance.reminders({relationship_status:'Pending',next_review:'2000-01-01'},{},{tier:null,residual:null}).reminders.length,0);
});
test('contract requirements cannot be replaced with checkbox-only assertions',()=>{
 const details={signedDate:'2020-01-01',expiresAt:'2099-01-01',evidencePath:'TPRM/signed.pdf',sla:'99.9% monthly',notificationHours:24,rtoHours:4,rpoHours:1};
 assert.equal(governance.contractDetails(details,{tier:'Tier 1 (Critical)'}).rtoHours,4);
 for(const patch of [{evidencePath:''},{signedDate:'2099-01-01'},{expiresAt:'2000-01-01'},{notificationHours:0},{rtoHours:''},{rpoHours:-1}])assert.throws(()=>governance.contractDetails({...details,...patch},{tier:'Tier 1 (Critical)'}),{status:400});
 assert.equal(governance.contractDetails({...details,rtoHours:'',rpoHours:'',continuityNA:'Non operational advisory service'},{tier:'Tier 3 (Standard)'}).continuityNA,'Non operational advisory service');
 assert.throws(()=>governance.dependencies([{name:'Cloud provider'}]),{status:400});
 assert.throws(()=>governance.dependencies([{name:'Cloud',service:'SaaS',dataLocation:'ID',owner:'Owner',exitPlan:'Export'}, {name:'CLOUD',service:'SaaS',dataLocation:'ID',owner:'Owner',exitPlan:'Export'}]),{status:400});
});
