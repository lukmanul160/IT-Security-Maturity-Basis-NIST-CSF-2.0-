const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

/** Exercise the real form adapter without a browser, API or application state. */
function fixture(showConditions = false) {
  const values = {
    twAssignrequester: 'requester', twAssignreviewer: 'reviewer', twAssignapprover: 'approver',
    twOwner: 'Owner', twSensitivity: '1', twAccess: '2', twImpact: '3', twReplacement: '2', twScope: 'Hosting',
    twNoRisks: 'No gaps', twNoDependencies: 'No providers', twReviewNotes: 'Verified', twEvidenceUntil: '2099-01-01',
    twDecision: 'Approved', twApprovalNotes: 'Accepted', twApprovalUntil: '2099-01-01', twRiskAcceptance: 'Scope matches', twRiskAcceptanceId: '12', twAccessLimits: 'Read only',
    twContractReference: 'Contract 1', twContractEvidence: 'fixture/contract.pdf', twContractSigned: '2026-01-01', twContractExpiry: '2099-01-01',
    twContractSla: '99.9%', twIncidentHours: '24', twRto: '8', twRpo: '4', twContinuityNA: '', twNextReview: '',
    twMonitoringNotes: 'Review reason', twReviewTrigger: 'incident', twExitNotes: 'End of service', twExitEvidence: 'fixture/exit.pdf', twExitStatus: 'Offboarded',
  };
  const controls = {access:'MFA',encryption:'Encryption',incident:'Incident',continuity:'Recovery'};
  for (const key of Object.keys(controls)) { values['twCritical'+key] = 'Pass'; values['twCriticalNotes'+key] = 'Evidence '+key; }
  const conditions = [{description:'Saved mitigation'}], draft = [{description:'Draft mitigation'}];
  const context = vm.createContext({
    $: id => id === 'twConditions' ? showConditions ? {} : null : { value: values[id] ?? '', checked: true },
    tprmLifecycleData: {conditions}, tprmCriticalLabels: controls,
    tprmContractLabels: {security:'Security',incident:'Incident',audit:'Audit',subprocessors:'Providers',dataExit:'Exit'},
    tprmExitLabels: {accessRevoked:'Access',dataResolved:'Data',obligationsResolved:'Contract'},
    readTprmConditions: () => draft, readTprmDependencies: () => [{provider:'Provider'}],
  });
  vm.runInContext(fs.readFileSync('frontend/client/src/workspace/features/tprm/lifecycle-form.js','utf8'), context);
  return action => JSON.parse(JSON.stringify(context.readTprmWorkflowPayload(action)));
}

test('assignment and profile payloads preserve the existing API contract', () => {
  const read = fixture();
  assert.deepEqual(read('assign').assignments, {requester:'requester',reviewer:'reviewer',approver:'approver'});
  const saved = read('save');
  assert.deepEqual(saved.profile, {owner:'Owner',dataSensitivity:'1',systemAccess:'2',businessImpact:'3',replaceability:'2',scope:'Hosting'});
  assert.equal(saved.noRisksReason,'No gaps');
  assert.deepEqual(saved.dependencies,[{provider:'Provider'}]);
});

test('tabs without mitigation controls retain saved conditions; visible controls read the draft', () => {
  assert.deepEqual(fixture()('approve').conditions,[{description:'Saved mitigation'}]);
  assert.deepEqual(fixture(true)('review').conditions,[{description:'Draft mitigation'}]);
});

test('review and return include verified evidence and each critical-control explanation', () => {
  for (const action of ['review','return']) {
    const body = fixture()(action);
    assert.equal(body.evidenceVerified,true);
    assert.equal(body.evidenceValidUntil,'2099-01-01');
    assert.equal(Object.keys(body.criticalControls).length,4);
    assert.deepEqual(body.criticalControls.access,{status:'Pass',notes:'Evidence access'});
  }
});

test('approval and activation keep acceptance, contract and empty automatic-review fields', () => {
  const read = fixture();
  assert.equal(read('approve').riskAcceptanceId,'12');
  assert.equal(read('approve').accessLimits,'Read only');
  const body = read('activate');
  assert.deepEqual(body.contract,{security:true,incident:true,audit:true,subprocessors:true,dataExit:true});
  assert.equal(body.contractDetails.evidencePath,'fixture/contract.pdf');
  assert.equal(body.contractDetails.rtoHours,'8');
  assert.equal(body.nextReview,'');
});

test('monitoring and exit actions preserve their own fields without sending another tab draft', () => {
  const read = fixture();
  for (const action of ['monitor','reassess']) {
    assert.equal(read(action).trigger,'incident');
    assert.equal(read(action).notes,'Review reason');
    assert.equal(read(action).profile,undefined);
  }
  for (const action of ['startOffboarding','close']) {
    const body = read(action);
    assert.equal(body.exitEvidencePath,'fixture/exit.pdf');
    assert.equal(body.relationshipStatus,'Offboarded');
    assert.deepEqual(body.exitChecklist,{accessRevoked:true,dataResolved:true,obligationsResolved:true});
  }
});
