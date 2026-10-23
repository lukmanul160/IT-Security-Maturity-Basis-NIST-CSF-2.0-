const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{parse}=require('@vue/compiler-dom');
const rules=require('../src/shared/tprmWorkflow'),governance=require('../src/services/tprmGovernanceService');
const read=name=>fs.readFileSync('frontend/client/src/workspace/components/'+name+'.vue','utf8');
const text=name=>{const nodes=parse(read(name).match(/<template>([\s\S]*)<\/template>/)[1]);let result='';const walk=node=>{if(node.type===2)result+=node.content+' ';for(const child of node.children||[])walk(child);};walk(nodes);return result;};
test('tiering reference matches implemented scoring bounds, critical dependencies and review policy',()=>{
 const content=text('TprmTieringView');
 const minimum=rules.cia(Object.fromEntries(rules.ciaFields.vendor.map(key=>[key,1])));
 const maximum=rules.cia(Object.fromEntries(rules.ciaFields.vendor.map(key=>[key,5])));
 assert.ok(content.includes(minimum.riskScore+'-'+maximum.riskScore));
 const low=rules.questionnaireScore({piiExposure:1,securityMaturity:1,financial:1,reputation:1}).riskScore;
 const high=rules.questionnaireScore({piiExposure:5,securityMaturity:5,financial:5,reputation:5}).riskScore;
 assert.ok(content.includes(low+'-'+high));
 for(const tier of ['Tier 1 (Critical)','Tier 2 (Important)','Tier 3 (Standard)'])assert.ok(content.includes(String(governance.reviewPolicy({tier,residual:0}).days)));
 assert.match(content,/ketergantungan.*kritis/);assert.match(content,/Risk Acceptance/);
});
test('guide preserves existing page IDs and explains required identities, evidence and separate activation',()=>{
 for(const [name,id] of [['TprmView','tprmView'],['TprmTieringView','tprmTieringView'],['TprmFlowView','tprmFlowView']]){
  assert.ok(read(name).includes('id="'+id+'"'));assert.ok(!/Workflow \?|\?70|\d\?\d/.test(read(name)));
 }
 const guide=text('TprmFlowView');for(const term of ['tiga akun berbeda','Risk Acceptance','kontrak ditandatangani','RTO/RPO','N/A','residual','Pending','Active','reviewer'])assert.ok(guide.includes(term),term);
 assert.equal((read('TprmFlowView').match(/id="tprmGuideStep\d+"/g)||[]).length,10);
});
