const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/services/riskWorkflowRules');
const day = '2026-10-13';
const author = { username: 'assessor', role: 'editor' }, approver = { username: 'chief', role: 'approver' }, reviewer = { username: 'reviewer', role: 'editor' };
const risk = { riskOwner: 'Business owner', riskCategory: 'Technical', effectedAsset: 'Server', identificationRisk: 'Ransomware outage', riskCause: 'Unpatched software', riskControl: 'Backups', riskAnalysis: 'Service unavailable', likelihood: 4, impact: 5, treatmentAction: 'Mitigation', riskTreatmentDescription: 'Patch and test recovery', ownerOfAction: 'IT', deadline: '2026-12-01', residualLikelihood: 1, residualImpact: 3 };
const complete = { ...rules.initial(), ...rules.sanitize({ threat: 'Ransomware', vulnerability: 'Missing patches', likelihoodRationale: 'External exposure', impactRationale: 'Service disruption', currentLikelihood: 3, currentImpact: 5, targetLikelihood: 1, targetImpact: 3, toleranceScore: 4, toleranceRationale: 'Board policy', approver: 'chief', reviewer: 'reviewer', evidence: '/files/recovery-report.pdf', verificationNotes: 'Recovery test passed', progress: 100, reviewDate: '2026-12-01', acceptanceFormId: 1, acceptanceExpiry: '2027-01-01', acceptanceReason: 'Temporary dependency', acceptanceConditions: 'Weekly monitoring', closureReason: 'System retired' }) };
const move = (data, action, actor = author, row = risk) => rules.transition(data, row, action, actor, 'Reviewed evidence', day);
test('full mitigation lifecycle requires independent approval, verification and closure', () => {
  let data = move(complete, 'assess'); data = move(data, 'submit');
  assert.throws(() => move(data, 'approve', author), { status: 403 });
  data = move(data, 'approve', approver); assert.equal(data.stage, 'In Treatment');
  data = move(data, 'complete'); assert.equal(data.stage, 'Pending Verification');
  assert.throws(() => move(data, 'verify', author), { status: 403 });
  data = move(data, 'verify', reviewer); assert.equal(data.stage, 'Monitoring');
  data = move(data, 'requestClosure'); assert.equal(data.stage, 'Pending Closure');
  data = move(data, 'close', approver); assert.equal(data.stage, 'Closed');
  assert.equal(move(data, 'reassess').stage, 'Draft');
});
test('draft cannot skip assessment or fabricate a completed control', () => {
  assert.throws(() => move(complete, 'approve', approver), { status: 409 });
  assert.throws(() => move(complete, 'assess', author, { ...risk, riskOwner: '' }), /riskOwner/);
  assert.throws(() => move({ ...complete, stage: 'In Treatment', progress: 50 }, 'complete'), /100%/);
  assert.throws(() => move({ ...complete, stage: 'In Treatment', evidence: '' }, 'complete'), /evidence/);
});
test('residual above tolerance returns to evaluation instead of monitoring', () => {
  const data = move({ ...complete, stage: 'Pending Verification', implementedBy: 'assessor' }, 'verify', reviewer, { ...risk, residualLikelihood: 5, residualImpact: 5 });
  assert.equal(data.stage, 'Assessed');
});
test('acceptance requires a form, conditions, future expiry and independent approval', () => {
  const acceptedRisk = { ...risk, treatmentAction: 'Acceptance' };
  let data = move(complete, 'assess', author, acceptedRisk); data = move(data, 'submit', author, acceptedRisk);
  assert.equal(data.approvalKind, 'acceptance');
  data = move(data, 'approve', approver, acceptedRisk); assert.equal(data.stage, 'Accepted');
  assert.throws(() => move({ ...complete, stage: 'Assessed', acceptanceExpiry: day }, 'submit', author, acceptedRisk), /Expiry/);
  assert.throws(() => move({ ...complete, stage: 'Assessed', acceptanceFormId: null }, 'submit', author, acceptedRisk), /acceptanceFormId/);
  assert.throws(() => move({ ...complete, stage: 'Assessed', approver: 'assessor' }, 'submit'), /berbeda/);
});
test('safe parsing rejects impossible dates, invalid scores and forged workflow state', () => {
  assert.throws(() => rules.sanitize({ reviewDate: '2026-02-30' }), /tanggal/);
  assert.throws(() => rules.sanitize({ toleranceScore: 26 }), /Tolerance/);
  assert.throws(() => rules.sanitize({ currentLikelihood: 0 }), /1–5/);
  const parsed = rules.sanitize({ stage: 'Closed', approvedBy: 'fake', version: 100 });
  assert.equal(parsed.stage, undefined); assert.equal(parsed.approvedBy, undefined); assert.equal(parsed.version, undefined);
});
test('closure requires evidence and cannot be self-approved', () => {
  assert.throws(() => move({ ...complete, stage: 'Monitoring', closureReason: '' }, 'requestClosure'), /closureReason/);
  assert.throws(() => move({ ...complete, stage: 'Pending Closure', submittedBy: 'chief' }, 'close', approver), /sendiri/);
});
test('expired acceptance cannot be extended through a review action', () => {
  assert.throws(() => move({ ...complete, stage: 'Accepted', acceptanceExpiry: '2026-10-12' }, 'review'), /kedaluwarsa/);
});
