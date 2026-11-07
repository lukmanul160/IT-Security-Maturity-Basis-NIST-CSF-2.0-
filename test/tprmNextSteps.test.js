const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('frontend/client/src/workspace/features/tprm/workflow-guidance.js','utf8');
const context=vm.createContext({});
vm.runInContext(source,context);
context.tprmCriticalLabels={access:'Access',encryption:'Encryption',incident:'Incident',continuity:'Continuity'};
const steps=(data,tab='assessment',actor='requester',writable=true)=>context.tprmNextSteps(data,tab,actor,writable,context.tprmCriticalLabels);
const messages=items=>items.map(item=>item.message).join(' ');
test('draft identifies missing assignments, answers, documents, residual and dependencies',()=>{
 const items=steps({stage:'Draft',summary:{readiness:{total:10,answered:3,documents:0}}});
 const text=messages(items);
 for(const expected of ['Admin','3/10','dokumen','residual rating','subvendor','Simpan profil'])assert.ok(text.includes(expected),expected);
 assert.ok(items.some(item=>item.target==='questionnaire'));
});
test('completed assessment does not report missing questionnaire or residual risk',()=>{
 const text=messages(steps({stage:'Draft',assignments:{requester:'requester',reviewer:'reviewer',approver:'approver'},profile:{owner:'PIC',dataSensitivity:1,systemAccess:2,businessImpact:3,replaceability:1},summary:{complete:true,residual:20,readiness:{total:2,answered:2,documents:1,complete:true}},noDependenciesReason:'None'}));
 assert.doesNotMatch(text,/Admin perlu|Lengkapi jawaban|Unggah minimal|residual rating|Daftarkan subvendor/);
});
test('permissions and assigned actor explain why an action is unavailable',()=>{
 const text=messages(steps({stage:'Under review',assignments:{reviewer:'assigned-reviewer'}},'review','another-user',false));
 assert.match(text,/tidak memiliki izin/);assert.match(text,/assigned-reviewer/);assert.match(text,/tidak dapat menjalankan/);
});
test('approval and activation explain stale review, critical failures and unfinished conditions',()=>{
 const data={stage:'Validated',summary:{residual:80},conditions:[{preActivation:true,completed:false}]};
 assert.match(messages(steps(data,'approval')),/Reviewer harus memvalidasi/);
 assert.match(messages(steps(data,'approval')),/Risk Acceptance/);
 assert.match(messages(steps(data,'approval')),/Approved with Conditions/);
 assert.match(messages(steps(data,'monitoring')),/approval belum ada/);
 assert.match(messages(steps(data,'monitoring')),/Selesaikan seluruh mitigasi/);
});
test('closed relationships direct users to history instead of editable steps',()=>{
 const items=steps({relationshipStatus:'Offboarded'});
 assert.equal(items.length,1);assert.equal(items[0].target,'history');
});


test('guidance markup escapes actor text and keeps shortcuts separate from active tabs',()=>{
 const viewContext=vm.createContext({
  tprmLifecycleActor:'reader',canPerform:()=>true,tprmCriticalLabels:{},
  escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
 });
 vm.runInContext(source,viewContext);
 vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/tprm/workflow-guidance-view.js','utf8'),viewContext);
 const html=viewContext.tprmNextStepsHtml({stage:'Under review',assignments:{reviewer:'<script>bad</script>'}},'review');
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.match(html,/type="button" class="attachment-action-button" data-tw-navigate="assignments"/);
 assert.doesNotMatch(html,/data-tw-tab=|aria-selected=/);
});
