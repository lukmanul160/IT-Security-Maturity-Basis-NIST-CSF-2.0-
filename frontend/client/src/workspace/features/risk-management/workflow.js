const rwFields = ['threat', 'vulnerability', 'likelihoodRationale', 'impactRationale', 'toleranceRationale', 'currentLikelihood', 'currentImpact', 'targetLikelihood', 'targetImpact', 'toleranceScore', 'approver', 'reviewer', 'progress', 'reviewDate', 'evidence', 'verificationNotes', 'acceptanceFormId', 'acceptanceExpiry', 'acceptanceReason', 'acceptanceConditions', 'closureReason'];
const rwLabels = { assess: 'Selesaikan assessment', submit: 'Ajukan approval', approve: 'Setujui', reject: 'Tolak', complete: 'Ajukan verifikasi', verify: 'Verifikasi residual', reassess: 'Assessment ulang', review: 'Catat review', requestClosure: 'Ajukan closure', close: 'Setujui closure' };
let rwRiskId = null, rwData = null, rwBusy = false, rwIdentity = null;
const rwField = key => $('rw' + key[0].toUpperCase() + key.slice(1));
async function rwRequest(path, options) {
  const response = await fetch('/api/risk-management' + path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Workflow tidak dapat dimuat.');
  return body;
}
function rwAvailable(data) {
  if (!canPerform('risk-management', 'update')) return [];
  const out = ({ Draft: ['assess'], Assessed: ['submit', 'requestClosure', 'reassess'], 'Pending Approval': ['approve', 'reject', 'reassess'], 'In Treatment': ['complete', 'reassess'], 'Pending Verification': ['verify', 'reassess'], Monitoring: ['review', 'requestClosure', 'reassess'], Accepted: ['review', 'requestClosure', 'reassess'], 'Pending Closure': ['close', 'reject', 'reassess'], Closed: ['reassess'] })[data.stage] || [];
  return out.filter(action => {
    if (data.effectiveStage === 'Review Required' && !['reassess', 'requestClosure', 'close', 'reject'].includes(action)) return false;
    if (['approve', 'reject', 'close'].includes(action)) return rwIdentity?.username === data.approver && ['admin', 'approver'].includes(rwIdentity?.role) && rwIdentity.username !== data.submittedBy;
    if (action === 'verify') return rwIdentity?.username === data.reviewer && rwIdentity.username !== data.implementedBy;
    return true;
  });
}
function rwRender(data) {
  rwData = data;
  $('rwTitle').textContent = `Workflow ${rwRiskId}`;
  $('rwStage').textContent = `${data.effectiveStage || data.stage} · Versi ${data.version}`;
  const warnings = [];
  if (data.reviewRequired) warnings.push('Jadwal review telah jatuh tempo.');
  if (data.expired) warnings.push('Acceptance kedaluwarsa: lakukan assessment ulang.');
  if (data.assessmentChanged || data.acceptanceChanged) warnings.push('Data assessment atau form acceptance berubah; approval perlu diperbarui.');
  if (!data.history.length) warnings.push('Risiko ini belum melewati workflow baru. Data lama tidak dianggap sebagai persetujuan.');
  $('rwWarning').hidden = !warnings.length; $('rwWarning').textContent = warnings.join(' ');
  rwFields.forEach(key => { const input = rwField(key); input.value = data[key] ?? ''; input.disabled = rwBusy || data.stage === 'Closed' || !canPerform('risk-management', 'update'); });
  $('rwSave').disabled = rwBusy || data.stage === 'Closed' || !canPerform('risk-management', 'update');
  $('rwActions').innerHTML = rwAvailable(data).map(action => `<button type="button" class="button ${['approve', 'verify', 'close'].includes(action) ? 'button-accent' : 'button-quiet'}" data-rw-action="${action}" ${rwBusy ? 'disabled' : ''}>${escapeHtml(rwLabels[action])}</button>`).join('');
  $('rwHistory').innerHTML = data.history.length ? data.history.map(event => `<article class="rw-event"><strong>${escapeHtml(rwLabels[event.action] || event.action)} · ${escapeHtml(event.snapshot.stage)}</strong><p data-no-translate>${escapeHtml(event.reason)}</p><small>${escapeHtml(event.actor)} · ${(globalThis.NistI18n?.dateHtml?.(event.createdAt, { timeZone: 'Asia/Bangkok' }) ?? escapeHtml(new Date(event.createdAt).toLocaleString(globalThis.NistI18n?.locale || 'id-ID', { timeZone: 'Asia/Bangkok' })))}</small><details><summary>Detail assessment saat keputusan</summary><pre>${escapeHtml(JSON.stringify(event.snapshot, null, 2))}</pre></details></article>`).join('') : '<p class="muted">Belum ada keputusan workflow.</p>';
}
async function rwOpen(id) {
  if (rwBusy) return;
  rwRiskId = id; rwData = null; $('rwStatus').textContent = 'Memuat workflow…'; $('rwReason').value = '';
  if (!$('riskWorkflowModal').open) $('riskWorkflowModal').showModal();
  $('rwSave').disabled = true; $('rwActions').innerHTML = '';
  try {
    const [data, users, identity] = await Promise.all([rwRequest(`/${encodeURIComponent(id)}/workflow`), rwRequest('/workflow-users'), fetch('/api/auth/me').then(r => r.json())]);
    rwIdentity = identity;
    for (const key of ['approver', 'reviewer']) rwField(key).innerHTML = '<option value="">Pilih akun</option>' + users.filter(user => key === 'reviewer' || user.canApprove).map(user => `<option value="${escapeHtml(user.username)}">${escapeHtml(user.username)} (${escapeHtml(user.role)})</option>`).join('');
    rwRender(data); $('rwStatus').textContent = 'Simpan data sebelum menjalankan keputusan. Approver dan reviewer harus memakai akun masing-masing.';
  } catch (error) { $('rwStatus').textContent = error.message; }
}
async function rwMutate(action) {
  if (rwBusy || !rwData) return;
  if (action !== 'save' && rwFields.some(key => String(rwData[key] ?? '') !== rwField(key).value)) { $('rwStatus').textContent = 'Simpan perubahan data workflow sebelum menjalankan keputusan.'; return; }
  rwBusy = true;
  const input = action === 'save' ? Object.fromEntries(rwFields.map(key => [key, rwField(key).value])) : { action, reason: $('rwReason').value.trim() };
  input.version = rwData.version;
  $('rwSave').disabled = true; $('rwActions').querySelectorAll('button').forEach(button => { button.disabled = true; }); $('rwClose').disabled = true;
  try {
    const data = await rwRequest(`/${encodeURIComponent(rwRiskId)}/workflow${action === 'save' ? '' : '/transition'}`, { method: action === 'save' ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    rwBusy = false; rwRender(data); $('rwReason').value = ''; $('rwStatus').textContent = action === 'save' ? 'Data tersimpan. Perubahan assessment/rencana memerlukan approval ulang.' : 'Keputusan tersimpan.';
    await loadRiskManagement();
  } catch (error) { $('rwStatus').textContent = error.message; }
  finally { rwBusy = false; $('rwClose').disabled = false; if (rwData) { $('rwSave').disabled = rwData.stage === 'Closed' || !canPerform('risk-management', 'update'); $('rwActions').querySelectorAll('button').forEach(button => { button.disabled = false; }); } }
}
$('riskWorkflowForm').addEventListener('submit', event => { event.preventDefault(); rwMutate('save'); });
$('riskWorkflowModal').addEventListener('cancel', event => { if (rwBusy) event.preventDefault(); });
$('riskManagementView').addEventListener('click', event => {
  const open = event.target.closest('[data-rw-open]'); if (open) rwOpen(open.dataset.rwOpen);
  const action = event.target.closest('[data-rw-action]'); if (action) rwMutate(action.dataset.rwAction);
  if (event.target.closest('#rwClose') && !rwBusy) $('riskWorkflowModal').close();
});
$('riskRegisterForm').addEventListener('input', event => { if (['rmImpact', 'rmScenarioImpact'].includes(event.target.id)) updateRiskCalculations(); });
$('riskManagementNewButton').addEventListener('click', resetRiskManagementForm);
riskRegisterColumns.splice(1, 0, { field: 'workflowStatus', label: 'Workflow status' });

$('riskRegisterWorkflowFilter').addEventListener('change', () => { riskRegisterPage = 1; renderRiskRegister(); });
