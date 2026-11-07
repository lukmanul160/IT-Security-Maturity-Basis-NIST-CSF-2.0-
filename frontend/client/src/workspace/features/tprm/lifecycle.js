/**
 * Pengendali dialog lifecycle TPRM: state, render tab, binding event, dan API.
 * Render: lifecycle-view.js; payload: lifecycle-form.js; panduan: workflow-guidance*.js.
 * Kontrak: ID DOM dipertahankan, server menentukan sah/tidaknya transisi.
 */
let tprmLifecycleRow = null, tprmLifecycleData = null, tprmLifecycleTab = 'assessment', tprmLifecycleActor = '';
const tprmLifecycleStages = ['Draft', 'Under review', 'Validated', 'Approved', 'Active', 'Offboarding', 'Closed'];
const tprmCriticalLabels = { access: 'Access control / MFA', encryption: 'Encryption & data protection', incident: 'Incident notification & response', continuity: 'Business continuity / recovery' };
const tprmContractLabels = { security: 'Persyaratan keamanan dan batas akses', incident: 'Kewajiban notifikasi dan koordinasi insiden', audit: 'Hak audit dan bukti kontrol', subprocessors: 'Ketentuan subkontraktor / subprocessor', dataExit: 'Pengembalian atau penghapusan data saat kontrak berakhir' };
const tprmExitLabels = { accessRevoked: 'Akses, akun, token, dan koneksi vendor sudah dicabut', dataResolved: 'Data dikembalikan / dihapus sesuai kewajiban dan bukti tersedia', obligationsResolved: 'Kewajiban kontrak dan tindakan terbuka sudah diselesaikan' };
/** Muat snapshot workflow terbaru dan identitas aktor sebelum memilih tab awal. */
async function openTprmLifecycle(row, requestedTab) {
  tprmLifecycleActor=(await workspaceUserReady)?.username || '';
  tprmLifecycleRow = row;
  const response = await fetch(`/api/tprm/${row.id}/workflow`,{cache:'no-store'});
  if (!response.ok) { $('tprmStatus').textContent = (await response.json()).error || 'Workflow unavailable'; return; }
  tprmLifecycleData = await response.json();
  const stage = tprmLifecycleData.stage;
  tprmLifecycleTab = stage === 'Under review' || stage === 'Mitigation' ? 'review' : stage === 'Validated' ? 'approval' : ['Approved','Active'].includes(stage) ? 'monitoring' : ['Offboarding','Closed'].includes(stage) ? 'offboarding' : 'assessment';
  if(requestedTab)tprmLifecycleTab=requestedTab;
  $('tprmWorkflowStatus').textContent = 'Ready'; renderTprmLifecycle(); $('tprmWorkflowModal').showModal();
}
/** Bentuk payload per aksi, kirim ke server, lalu muat ulang register setelah sukses. */
async function saveTprmLifecycle(event) {
  event.preventDefault(); const action = event.submitter?.value;
  if (!action || !tprmLifecycleRow) return;
  const data = readTprmWorkflowPayload(action);
  $('tprmWorkflowStatus').textContent = 'Saving...';
  try {
    const response = await fetch(`/api/tprm/${tprmLifecycleRow.id}/workflow`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Save failed');
    tprmLifecycleData = body; await Promise.all([loadQuestionnaires(),loadTprmRows()]);
    tprmLifecycleRow = tprmRows.find(row => String(row.id) === String(tprmLifecycleRow.id)) || tprmLifecycleRow;
    if (['submit','review','approve','activate','startOffboarding','close'].includes(action)) tprmLifecycleTab = action === 'submit' ? 'review' : action === 'review' ? (body.stage === 'Mitigation' ? 'review' : 'approval') : action === 'approve' || action === 'activate' ? 'monitoring' : 'offboarding';
    renderTprmLifecycle(); $('tprmWorkflowStatus').textContent = 'Saved';
  } catch (error) { $('tprmWorkflowStatus').textContent = error.message; }
}
$('tprmWorkflowForm').addEventListener('submit',guardFormSubmission(saveTprmLifecycle));
$('tprmWorkflowClose').addEventListener('click',() => $('tprmWorkflowModal').close());
$('tprmWorkflowModal').addEventListener('click',event => {
  if(event.target.closest('[data-tw-add-dependency]'))renderTprmDependencies([...readTprmDependencies(),{}]);
  if(event.target.closest('[data-tw-remove-dependency]'))event.target.closest('[data-tw-dependency]').remove();
  const tab = event.target.closest('[data-tw-tab],[data-tw-navigate]'); if (tab) {tprmLifecycleTab = tab.dataset.twTab || tab.dataset.twNavigate;renderTprmLifecycle();}
  if (event.target.closest('[data-tw-add-condition]')) renderTprmConditions([...readTprmConditions(),{}]);
  const remove = event.target.closest('[data-tw-remove-condition]'); if (remove) {const node = remove.closest('[data-tw-condition]');node.remove();}
  if (event.target.closest('[data-tw-questionnaire]')) { const row = questionnaireForTprm(tprmLifecycleRow);if(row){$('tprmWorkflowModal').close();startQuestionnaire(row);} }
  if (event.target.closest('[data-tw-cia]')) {$('tprmWorkflowModal').close();chooseTprmAssessmentType(tprmLifecycleRow);}
  if (event.target.closest('[data-tw-risks]')) {$('tprmWorkflowModal').close();openRiskRegisterForTprm(tprmLifecycleRow);}
});
$('tprmBody').addEventListener('click',event => {const button = event.target.closest('[data-tprm-workflow]');if(button){const row=tprmRows.find(item=>String(item.id)===button.dataset.tprmWorkflow);if(row)openTprmLifecycle(row).catch(error=>{$('tprmStatus').textContent=error.message;});}});

$('tprmGovernanceBody').addEventListener('click',event=>{const button=event.target.closest('[data-tprm-assignments]');if(!button)return;const row=tprmRows.find(item=>String(item.id)===button.dataset.tprmAssignments);if(row)openTprmLifecycle(row,'assignments').catch(error=>{$('tprmStatus').textContent=error.message;});});
