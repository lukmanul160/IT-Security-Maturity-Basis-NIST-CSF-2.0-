const assert = require('node:assert/strict');
const { pool } = require('../src/config/database');
const questionnaires = require('../src/services/tprmQuestionnaireService');
const register = require('../src/services/tprmService');
const workflow = require('../src/services/tprmWorkflowService');
const rules = require('../src/shared/tprmWorkflow');
async function run() {
  let q, vendor;
  const reviewer={username:'qa-tprm-reviewer',role:'editor'}, approver={username:'qa-tprm-approver',role:'approver'};
  const reject=async(promise,pattern)=>assert.rejects(promise,pattern);
  try {
    await questionnaires.ensureStore();await register.ensureStore();
    q=await questionnaires.create({vendorName:`QA TPRM ${Date.now()}`,status:'Draft',result:'Pending',responses:{}},reviewer);
    vendor=await register.create({thirdParty:q.vendorName,questionnaireId:q.id,serviceDependency:'QA only',relationshipStatus:'Active',assessmentStatus:'Complete'});
    assert.equal(vendor.relationshipStatus,'Pending');assert.equal(vendor.riskLevel,'Not assessed');
    await reject(workflow.act(vendor.id,{action:'submit'},reviewer),/Lengkapi/);
    await reject(register.update(vendor.id,{...vendor,relationshipStatus:'Active'},reviewer),/workflow/);
    const responses={...q.responses,vendorDocuments:[{path:'qa-tprm-exit.pdf',name:'QA closure evidence'}],piiExposure:5,securityMaturity:5,financial:5,reputation:5,riskScore:0};
    for(const [title,questions] of responses.questionnaireSections)questions.forEach((_,index)=>{responses[`${title}-${index}`]='Evidence verified';responses[`${title}-${index}-decision`]='Yes';});
    q=await questionnaires.update(q.id,{...q,responses,status:'Complete'},reviewer);assert.equal(q.responses.riskScore,500);
    await reject(questionnaires.update(q.id,{...q,result:'Approved',status:'Final'},reviewer),/workflow/);
    const cia=Object.fromEntries(rules.ciaFields.vendor.map(key=>[key,5]));
    vendor=await register.update(vendor.id,{...vendor,dueDiligenceAssessment:{...cia,riskScore:0}},reviewer);assert.equal(vendor.dueDiligenceAssessment.riskScore,100);
    const plan=[{description:'Verify contract evidence',owner:'QA owner',dueDate:'2098-01-01',preActivation:true,completed:false,evidence:''}];
    await workflow.act(vendor.id,{action:'save',profile:{owner:'QA owner',dataSensitivity:1,systemAccess:1,businessImpact:1,replaceability:1},noRisksReason:'No control gaps identified',conditions:plan},reviewer);
    await workflow.act(vendor.id,{action:'submit'},reviewer);
    const controls=Object.fromEntries(rules.criticalControls.map(key=>[key,{status:'Pass',notes:'Verified supporting evidence'}]));
    await reject(workflow.act(vendor.id,{action:'review',notes:'Verified',evidenceVerified:true,evidenceValidUntil:'2099-01-01',criticalControls:controls,conditions:plan},{username:'qa-user',role:'user'}),/Review hanya/);
    let result=await workflow.act(vendor.id,{action:'review',notes:'Verified evidence and residual risks',evidenceVerified:true,evidenceValidUntil:'2099-01-01',criticalControls:{...controls,access:{status:'Fail',notes:'MFA not verified'}},conditions:plan},reviewer);assert.equal(result.stage,'Mitigation');
    await reject(workflow.act(vendor.id,{action:'approve',decision:'Approved with Conditions',notes:'Accepted',expiresAt:'2099-01-01',accessLimits:'Restricted'},approver),/Kontrol kritis/);
    result=await workflow.act(vendor.id,{action:'review',notes:'MFA now verified',evidenceVerified:true,evidenceValidUntil:'2099-01-01',criticalControls:controls,conditions:plan},reviewer);assert.equal(result.stage,'Validated');
    await reject(workflow.act(vendor.id,{action:'approve',decision:'Approved',notes:'Accept',expiresAt:'2099-01-01'},reviewer),/Keputusan hanya/);
    await reject(workflow.act(vendor.id,{action:'approve',decision:'Approved',notes:'Accept',expiresAt:'2099-01-01'},{...reviewer,role:'admin'}),/berbeda/);
    await reject(workflow.act(vendor.id,{action:'approve',decision:'Approved',notes:'Accept',expiresAt:'2099-01-01'},approver),/mitigasi terbuka/i);
    result=await workflow.act(vendor.id,{action:'approve',decision:'Approved with Conditions',notes:'Conditional acceptance',expiresAt:'2099-01-01',accessLimits:'Read-only until evidence verified'},approver);assert.equal(result.approved,true);
    const activation={action:'activate',contract:Object.fromEntries(rules.contractControls.map(key=>[key,true])),contractReference:'QA contract',nextReview:'2098-01-01',conditions:plan};
    await reject(workflow.act(vendor.id,activation,reviewer),/Selesaikan syarat/);
    activation.conditions=plan.map(item=>({...item,completed:true,evidence:'Contract inspected'}));
    result=await workflow.act(vendor.id,activation,reviewer);assert.equal(result.relationshipStatus,'Active');assert.equal(result.nextReview,'2098-01-01');assert.equal((await register.list()).find(row=>row.id===vendor.id).nextReview,'2098-01-01');
    assert.ok(result.history.some(item=>item.action==='approve'&&item.snapshot.questionnaire));assert.ok(result.questionnaireHistory.length>=2);
    q=await questionnaires.get(q.id);
    const excel=require('../src/services/tprmQuestionnaireExcelService'),XLSX=require('xlsx');
    const exported=await excel.exportRecord(q.id),book=XLSX.read(exported.buffer,{type:'buffer'});
    book.Sheets.Kuesioner.E2={t:'s',v:'Vendor updated evidence offline'};book.Sheets.Kuesioner.F2={t:'s',v:'vendor-audit.pdf'};
    const returned=XLSX.write(book,{type:'buffer',bookType:'xlsx'}),preview=await excel.preview(q.id,returned);
    await reject(excel.importRecord(q.id,returned,reviewer,preview.expectedRevision+1),/berubah selama import/);
    const imported=await excel.importRecord(q.id,returned,reviewer,preview.expectedRevision);
    assert.equal(imported.record.status,'In progress');assert.equal(imported.record.result,'Pending');assert.equal(imported.record.responses.riskScore,q.responses.riskScore);assert.deepEqual(imported.record.responses.vendorDocuments,q.responses.vendorDocuments);
    assert.equal(imported.record.responses[q.responses.questionnaireSections[0][0]+'-0'],'Vendor updated evidence offline');
    await reject(excel.preview(q.id,returned),/berubah setelah/);
    result=await workflow.get(vendor.id);assert.equal(result.reviewed,false);assert.equal(result.approved,false);
    await reject(workflow.act(vendor.id,activation,reviewer),/Action activate/);
    await workflow.act(vendor.id,{action:'reassess',notes:'Annual review / service changed'},reviewer);
    await workflow.act(vendor.id,{action:'startOffboarding',notes:'Contract ending'},reviewer);
    await reject(workflow.act(vendor.id,{action:'close',notes:'Closed',relationshipStatus:'Offboarded'},reviewer),/Checklist/);
    result=await workflow.act(vendor.id,{action:'close',notes:'Verified closure',relationshipStatus:'Offboarded',exitChecklist:Object.fromEntries(rules.exitControls.map(key=>[key,true])),exitEvidencePath:'qa-tprm-exit.pdf'},reviewer);assert.equal(result.stage,'Closed');
    await reject(register.update(vendor.id,vendor,reviewer),/ditutup/);
    await reject(questionnaires.remove(q.id),/digunakan/);
    console.log('PASS TPRM lifecycle: incomplete, scoring, critical gates, role separation, conditional activation, stale review, immutable snapshots, reassessment and offboarding');
  } finally {
    if(vendor)await pool.query('DELETE FROM tprm_risk_register WHERE id=$1',[vendor.id]);
    if(q){await pool.query('DELETE FROM tprm_questionnaire_history WHERE questionnaire_id=$1',[q.id]);await pool.query('DELETE FROM tprm_due_diligence_questionnaires WHERE id=$1',[q.id]);}
    await pool.end();
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
