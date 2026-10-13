const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/shared/tprmWorkflow');

function fixture() {
  const responses = { questionnaireSections: [['Security',['MFA?']]], 'Security-0-decision':'Yes', 'Security-0':'Verified audit report', vendorDocuments:[{path:'evidence.pdf'}], piiExposure:5, securityMaturity:5, financial:5, reputation:5 };
  const row = { thirdParty:'Vendor', serviceDependency:'Hosting', questionnaireId:1, workflow:{profile:{owner:'Owner',dataSensitivity:1,systemAccess:1,businessImpact:1,replaceability:1},noRisksReason:'No gaps found'},dueDiligenceAssessment:Object.fromEntries(rules.ciaFields.vendor.map(key=>[key,5])) };
  return {row,questionnaire:{responses},risks:[]};
}
test('missing assessment stays incomplete instead of Low Risk',()=>{
  const summary=rules.riskSummary({workflow:{},dueDiligenceAssessment:{}},{responses:{}},[]);
  assert.equal(summary.complete,false);assert.equal(summary.residual,null);assert.equal(summary.level,'Incomplete');
});
test('server recalculates CIA and rejects missing, fractional or out-of-range indicators',()=>{
  const {row}=fixture();const scored=rules.cia({...row.dueDiligenceAssessment,riskScore:1,riskTier:'High'});
  assert.equal(scored.riskScore,100);
  for(const value of ['',null,0,6,2.5])assert.deepEqual(rules.cia({...row.dueDiligenceAssessment,dataAccess:value}),{});
});
test('due diligence requires every decision, explanation, scores and evidence, including N/A reasons',()=>{
  const {questionnaire}=fixture();assert.equal(rules.questionnaireReadiness(questionnaire.responses).complete,true);
  for(const patch of [{'Security-0':''},{'Security-0-decision':''},{vendorDocuments:[]},{financial:''}]) assert.equal(rules.questionnaireReadiness({...questionnaire.responses,...patch}).complete,false);
  assert.equal(rules.questionnaireReadiness({...questionnaire.responses,'Security-0-decision':'N/A'}).complete,true);
});
test('criticality uses highest impact and does not dilute critical access',()=>{
  const {row}=fixture();assert.equal(rules.profileTier({...row.workflow.profile,systemAccess:3}),'Tier 1 (Critical)');
  assert.equal(rules.profileTier({...row.workflow.profile,owner:''}),null);
});
test('residual risk is distinct from inherent risk and missing residual is unknown',()=>{
  const {row,questionnaire}=fixture();
  let summary=rules.riskSummary(row,questionnaire,[{risk_rating:'Very High',residual_rating:'Low'}]);
  assert.equal(summary.inherent,100);assert.equal(summary.residual,25);assert.equal(summary.level,'Low Risk');
  summary=rules.riskSummary(row,questionnaire,[{risk_rating:'High',residual_rating:''}]);assert.equal(summary.residual,null);assert.equal(summary.level,'Not assessed');
  assert.equal(rules.riskSummary({...row,workflow:{...row.workflow,noRisksReason:''}},questionnaire,[]).residual,null);
});
test('review fingerprint changes when answers, service scope, CIA or residual risks change',()=>{
  const {row,questionnaire,risks}=fixture();const original=rules.fingerprint(row,questionnaire,risks);
  assert.notEqual(original,rules.fingerprint({...row,serviceDependency:'Payroll'},questionnaire,risks));
  assert.notEqual(original,rules.fingerprint(row,{responses:{...questionnaire.responses,'Security-0':'New evidence'}},risks));
  assert.notEqual(original,rules.fingerprint(row,questionnaire,[{risk_id:'R1',residual_rating:'High'}]));
});
test('critical failures and unsupported N/A claims cannot pass the gate',()=>{
  const controls=Object.fromEntries(rules.criticalControls.map(key=>[key,{status:'Pass',notes:'Evidence verified'}]));
  assert.equal(rules.checkCritical(controls),true);controls.access.status='Fail';assert.equal(rules.checkCritical(controls),false);
  controls.access={status:'N/A',notes:''};assert.equal(rules.checkCritical(controls),false);
});
test('dates reject impossible dates and require a future expiry',()=>{
  assert.equal(rules.validDate('2027-02-30'),false);assert.equal(rules.futureDate('2000-01-01'),false);assert.equal(rules.futureDate('2099-01-01'),true);
});
