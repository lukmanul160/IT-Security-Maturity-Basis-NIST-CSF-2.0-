const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function context() {
  const fields = Object.fromEntries(['tdSearch','tdRisk','tdRelationship','tdReview'].map(id=>[id,{value:''}]));
  const ctx = vm.createContext({ Intl, Date, $: id=>fields[id], normalizeTprmRelationshipStatus:v=>v||'Active' });
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/shared/governance-dashboard.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/tprm/dashboard.js','utf8').split("document.querySelector('[data-view=\"tprm-register\"]')")[0],ctx);
  return {ctx,fields};
}
function riskPickerContext() {
  let finish, renders=0;
  const dialog={open:false,_tprmRow:null};
  const source=fs.readFileSync('frontend/client/src/workspace/features/tprm/vendor-register.js','utf8');
  const functionSource=source.slice(source.indexOf('function openRiskRegisterForTprm('),source.indexOf('\nfunction ensureTprmRelatedRiskModal('));
  const ctx=vm.createContext({ $:()=>dialog, renderTprmRiskPicker:row=>{renders++;dialog.open=true;dialog._tprmRow=row;},loadRiskManagement:()=>new Promise(resolve=>{finish=resolve;}) });
  vm.runInContext(functionSource,ctx);
  return {ctx,dialog,finish:()=>finish(),renders:()=>renders};
}
test('late risk data cannot reopen a cancelled picker',async()=>{
  const {ctx,dialog,finish,renders}=riskPickerContext();
  const pending=vm.runInContext('openRiskRegisterForTprm({id:1})',ctx);
  dialog.open=false;finish();await pending;
  assert.equal(dialog.open,false);assert.equal(renders(),1);
});
test('late risk data cannot replace another vendor picker',async()=>{
  const {ctx,dialog,finish,renders}=riskPickerContext();
  const pending=vm.runInContext('openRiskRegisterForTprm({id:1})',ctx);
  dialog._tprmRow={id:2};finish();await pending;
  assert.equal(dialog._tprmRow.id,2);assert.equal(renders(),1);
});
test('TPRM global filters intersect vendor, level and relationship',()=>{
  const {ctx,fields}=context();fields.tdSearch.value='cloud';fields.tdRisk.value='High';fields.tdRelationship.value='Active';
  assert.equal(vm.runInContext("tdScope({thirdParty:'Cloud provider',riskLevel:'High',relationshipStatus:'Active'})",ctx),true);
  assert.equal(vm.runInContext("tdScope({thirdParty:'Cloud provider',riskLevel:'Low',relationshipStatus:'Active'})",ctx),false);
  assert.equal(vm.runInContext("tdScope({thirdParty:'Cloud provider',riskLevel:'High',relationshipStatus:'Offboarded'})",ctx),false);
});
test('TPRM review ignores inactive relationships and unassigned dates',()=>{
  const {ctx}=context();
  assert.equal(vm.runInContext("tdDue({relationshipStatus:'Active',nextReview:'2000-01-01'})",ctx),true);
  assert.equal(vm.runInContext("tdDue({relationshipStatus:'Offboarded',nextReview:'2000-01-01'})",ctx),false);
  assert.equal(vm.runInContext("tdDue({relationshipStatus:'Active',nextReview:''})",ctx),false);
  assert.equal(vm.runInContext("tdReviewLabel({relationshipStatus:'Active',nextReview:''})",ctx),'Belum dijadwalkan');
});
test('TPRM drill filters preserve exact IDs and unassessed records are not high',()=>{
  const {ctx}=context();
  assert.equal(vm.runInContext("tdIsHigh({questionnaireId:123})",ctx),false);
  vm.runInContext("tdDrill={ids:new Set(['12'])}; tdQuestionDrill=new Set(['24']);",ctx);
  assert.equal(vm.runInContext("tdVendorMatches({id:12})",ctx),true);
  assert.equal(vm.runInContext("tdVendorMatches({id:120})",ctx),false);
  assert.equal(vm.runInContext("tdQuestionMatches({id:24})",ctx),true);
  assert.equal(vm.runInContext("tdQuestionMatches({id:240})",ctx),false);
});
