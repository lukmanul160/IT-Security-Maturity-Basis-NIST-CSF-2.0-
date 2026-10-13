const stages = ['Draft', 'Assessed', 'Pending Approval', 'In Treatment', 'Pending Verification', 'Monitoring', 'Accepted', 'Pending Closure', 'Closed'];
const editable = ['Draft', 'Assessed', 'In Treatment', 'Monitoring'];
const textFields = ['threat', 'vulnerability', 'likelihoodRationale', 'impactRationale', 'toleranceRationale', 'approver', 'reviewer', 'evidence', 'verificationNotes', 'acceptanceReason', 'acceptanceConditions', 'closureReason'];
const scoreFields = ['currentLikelihood', 'currentImpact', 'targetLikelihood', 'targetImpact'];
const dateFields = ['reviewDate', 'acceptanceExpiry'];
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
function completeScore(l, i) { return [l, i].every(n => Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 5); }
function must(data, keys) { for (const key of keys) if (!String(data[key] ?? '').trim()) fail(`${key} wajib diisi sebelum melanjutkan.`); }
function initial() { return { stage: 'Draft', version: 0 }; }
function sanitize(input) {
  const out = {};
  for (const key of textFields) { out[key] = String(input[key] ?? '').trim(); if (out[key].length > 10000) fail(`${key} maksimal 10000 karakter.`); }
  for (const key of scoreFields) { out[key] = input[key] === '' || input[key] == null ? null : Number(input[key]); if (out[key] !== null && !completeScore(out[key], 1)) fail(`${key} harus 1–5.`); }
  for (const key of dateFields) { out[key] = String(input[key] || ''); if (out[key] && !validDate(out[key])) fail(`${key} harus tanggal kalender yang valid.`); }
  out.toleranceScore = input.toleranceScore === '' || input.toleranceScore == null ? null : Number(input.toleranceScore);
  if (out.toleranceScore !== null && (!Number.isInteger(out.toleranceScore) || out.toleranceScore < 1 || out.toleranceScore > 25)) fail('Tolerance harus 1–25.');
  out.progress = Number(input.progress || 0);
  if (!Number.isInteger(out.progress) || out.progress < 0 || out.progress > 100) fail('Progress harus 0–100.');
  out.acceptanceFormId = input.acceptanceFormId ? Number(input.acceptanceFormId) : null;
  if (out.acceptanceFormId !== null && (!Number.isSafeInteger(out.acceptanceFormId) || out.acceptanceFormId < 1)) fail('Acceptance form ID tidak valid.');
  return out;
}
function approval(actor, data) {
  if (!['admin', 'approver'].includes(actor.role) || actor.username !== data.approver) fail('Hanya akun approver yang ditunjuk dapat memutuskan.', 403);
  if (actor.username === data.submittedBy) fail('Pemohon tidak boleh menyetujui pengajuannya sendiri.', 403);
}
function transition(previous, risk, action, actor, reason, day = today()) {
  if (!actor?.username) fail('Akun pengguna diperlukan.', 403);
  if (!String(reason || '').trim()) fail('Alasan keputusan wajib diisi.');
  const data = { ...previous };
  const allowed = (...values) => { if (!values.includes(data.stage)) fail(`Aksi ${action} tidak tersedia pada ${data.stage}.`, 409); };
  const assessment = () => {
    must(risk, ['riskOwner', 'riskCategory', 'effectedAsset', 'identificationRisk', 'riskCause', 'riskControl', 'riskAnalysis']);
    must(data, ['threat', 'vulnerability', 'likelihoodRationale', 'impactRationale']);
    if (!completeScore(risk.likelihood, risk.impact) || !completeScore(data.currentLikelihood, data.currentImpact)) fail('Lengkapi inherent dan current assessment (1–5).');
  };
  switch (action) {
    case 'assess': allowed('Draft'); assessment(); data.stage = 'Assessed'; break;
    case 'submit':
      allowed('Assessed'); assessment(); must(data, ['approver', 'reviewer', 'toleranceScore', 'toleranceRationale']);
      if (!['Mitigation', 'Acceptance', 'Transfer', 'Avoidance'].includes(risk.treatmentAction)) fail('Pilih salah satu dari empat treatment.');
      if (data.approver === actor.username) fail('Pilih approver berbeda dari pemohon.');
      if (risk.treatmentAction === 'Acceptance') {
        must(data, ['acceptanceReason', 'acceptanceConditions', 'acceptanceExpiry', 'reviewDate', 'acceptanceFormId']);
        if (data.acceptanceExpiry <= day || data.reviewDate < day || data.reviewDate > data.acceptanceExpiry) fail('Expiry harus setelah hari ini; review tidak boleh melewati expiry.');
        data.approvalKind = 'acceptance';
      } else {
        must(risk, ['riskTreatmentDescription', 'ownerOfAction', 'deadline']);
        if (!validDate(String(risk.deadline)) || String(risk.deadline) < day) fail('Deadline treatment harus hari ini atau setelahnya.');
        if (!completeScore(data.targetLikelihood, data.targetImpact)) fail('Lengkapi target residual (1–5).');
        data.approvalKind = 'plan';
      }
      data.submittedBy = actor.username; data.stage = 'Pending Approval'; break;
    case 'approve':
      allowed('Pending Approval'); approval(actor, data);
      if (data.approvalKind === 'acceptance' && (data.acceptanceExpiry <= day || data.reviewDate < day)) fail('Tanggal acceptance harus diperbarui sebelum approval.');
      data.approvedBy = actor.username; data.approvedAt = new Date().toISOString(); data.stage = data.approvalKind === 'acceptance' ? 'Accepted' : 'In Treatment'; break;
    case 'reject': allowed('Pending Approval', 'Pending Closure'); approval(actor, data); data.stage = data.stage === 'Pending Closure' ? data.beforeClosure : 'Assessed'; break;
    case 'complete': allowed('In Treatment'); must(data, ['evidence']); if (data.progress !== 100) fail('Progress harus 100% sebelum verifikasi.'); data.implementedBy = actor.username; data.stage = 'Pending Verification'; break;
    case 'verify':
      allowed('Pending Verification');
      if (data.reviewer !== actor.username || data.implementedBy === actor.username) fail('Verifikasi harus dilakukan reviewer yang ditunjuk, berbeda dari pelaksana.', 403);
      must(data, ['evidence', 'verificationNotes', 'reviewDate']);
      if (data.reviewDate < day || !completeScore(risk.residualLikelihood, risk.residualImpact)) fail('Lengkapi residual aktual dan review date yang belum lewat.');
      data.verifiedBy = actor.username; data.verifiedAt = new Date().toISOString();
      data.stage = Number(risk.residualLikelihood) * Number(risk.residualImpact) <= data.toleranceScore ? 'Monitoring' : 'Assessed';
      break;
    case 'reassess': allowed('Assessed', 'Pending Approval', 'In Treatment', 'Pending Verification', 'Monitoring', 'Accepted', 'Pending Closure', 'Closed'); data.stage = 'Draft'; data.approvedBy = null; data.verifiedBy = null; data.acceptanceSnapshot = null; break;
    case 'review': allowed('Monitoring', 'Accepted'); must(data, ['evidence', 'reviewDate']); if (data.reviewDate <= day) fail('Review berikutnya harus setelah hari ini.'); if (data.stage === 'Accepted' && (data.acceptanceExpiry <= day || data.reviewDate > data.acceptanceExpiry)) fail('Acceptance kedaluwarsa harus di-assess ulang.'); data.lastReviewedAt = new Date().toISOString(); break;
    case 'requestClosure': allowed('Monitoring', 'Accepted', 'Assessed'); must(data, ['closureReason', 'evidence', 'approver']); if (data.approver === actor.username) fail('Pilih approver closure berbeda dari pemohon.'); data.beforeClosure = data.stage; data.submittedBy = actor.username; data.stage = 'Pending Closure'; break;
    case 'close': allowed('Pending Closure'); approval(actor, data); must(data, ['closureReason', 'evidence']); data.stage = 'Closed'; data.closedBy = actor.username; data.closedAt = new Date().toISOString(); break;
    default: fail('Aksi workflow tidak valid.');
  }
  return data;
}
module.exports = { stages, editable, initial, sanitize, transition, today, fail, completeScore };
