/**
 * Controller Risk Workflow: state, request API, mutasi dan binding event.
 * Aturan panduan di workflow-model.js; adapter DOM di workflow-view.js.
 * Endpoint, payload version dan otorisasi server tetap menjadi kontrak.
 */
const rwFields = ['threat', 'vulnerability', 'likelihoodRationale', 'impactRationale', 'toleranceRationale', 'currentLikelihood', 'currentImpact', 'targetLikelihood', 'targetImpact', 'toleranceScore', 'approver', 'reviewer', 'progress', 'reviewDate', 'evidence', 'verificationNotes', 'acceptanceFormId', 'acceptanceExpiry', 'acceptanceReason', 'acceptanceConditions', 'closureReason'];
const rwLabels = { assess: 'Selesaikan assessment', submit: 'Ajukan approval', approve: 'Setujui', reject: 'Tolak', complete: 'Ajukan verifikasi', verify: 'Verifikasi residual', reassess: 'Assessment ulang', review: 'Catat review', requestClosure: 'Ajukan closure', close: 'Setujui closure' };
let rwReturnAfterEdit=null, rmSaving=false;
let rwRiskId = null, rwData = null, rwBusy = false, rwIdentity = null;
const rwField = key => $('rw' + key[0].toUpperCase() + key.slice(1));
async function rwRequest(path, options) {
  const response = await fetch('/api/risk-management' + path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body.error || 'Workflow tidak dapat dimuat.')+(body.requestId?' (Ref: '+body.requestId+')':''));
  return body;
}








async function rwOpen(id) {
  if (rwBusy) return;
  $('rwActionStatus').hidden=true;
  rwRiskId = id; rwData = null; $('rwStatus').textContent = 'Memuat workflow…'; $('rwReason').value = '';
  if (!$('riskWorkflowModal').open) $('riskWorkflowModal').showModal();
  $('rwSave').disabled = true; $('rwActions').innerHTML = '';$('rwGuide').textContent='Memuat langkah berikutnya...';rwFields.forEach(key=>{rwField(key).disabled=true;});
  try {
    const [data, users, identity] = await Promise.all([rwRequest(`/${encodeURIComponent(id)}/workflow`), rwRequest('/workflow-users'), fetch('/api/auth/me').then(r => r.json())]);
    rwIdentity = identity;
    for (const key of ['approver', 'reviewer']) rwField(key).innerHTML = '<option value="">Pilih akun</option>' + users.filter(user => key === 'reviewer' || user.canApprove).map(user => `<option value="${escapeHtml(user.username)}">${escapeHtml(user.username)} (${escapeHtml(user.role)})</option>`).join('');
    rwRender(data); $('rwStatus').textContent = 'Simpan data sebelum menjalankan keputusan. Approver dan reviewer harus memakai akun masing-masing.';
  } catch (error) { $('rwStatus').textContent = error.message; }
}

/** Kirim perubahan workflow menurut aksi dan version; respons konflik ditampilkan agar pengguna memuat versi baru. */
async function rwMutate(action) {
  if(rwBusy){rwActionFeedback('Permintaan masih diproses. Tunggu hasilnya.');return;}
  if(!rwData){rwActionFeedback('Workflow belum dimuat. Tutup dialog lalu buka kembali.','error');return;}
  try {
    if(action!=='save'&&rwFields.some(key=>String(rwData[key]??'')!==rwField(key).value)){
      rwActionFeedback('Belum dikirim: ada perubahan yang belum disimpan. Klik Simpan data workflow, lalu ajukan kembali.','error');
      $('rwSave').classList.add('rw-needs-input');return;
    }
    if(action!=='save'&&!$('rwReason').value.trim()){
      rwRenderGuide(rwLiveData(),false);rwActionFeedback('Belum dikirim: isi Alasan keputusan tepat di atas tombol ini.','error');$('rwReason').focus({preventScroll:true});return;
    }
    const primary={Draft:'assess',Assessed:'submit','In Treatment':'complete','Pending Verification':'verify',Monitoring:'review',Accepted:'review','Pending Closure':'close'}[rwData.stage];
    if(action===primary){
      const guide=rwGuidance(rwLiveData(),rwLiveRisk());
      if(guide.issues.length){
        rwRenderGuide(rwLiveData(),false);
        const first=guide.issues[0];rwActionFeedback(`Belum dikirim: ${first.label} ${first.reason} (${first.where}). Buka daftar Langkah berikutnya untuk melengkapi isian.`, 'error');
        return;
      }
    }
    rwBusy=true;
    const input=action==='save'?Object.fromEntries(rwFields.map(key=>[key,rwField(key).value])):{action,reason:$('rwReason').value.trim()};input.version=rwData.version;
    $('rwSave').disabled=true;$('rwActions').querySelectorAll('button').forEach(button=>{button.disabled=true;});$('rwClose').disabled=true;
    rwActionFeedback(action==='save'?'Menyimpan data workflow...':`Memproses ${rwLabels[action]||action}...`,'pending');
    const data=await rwRequest(`/${encodeURIComponent(rwRiskId)}/workflow${action==='save'?'':'/transition'}`,{method:action==='save'?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    rwBusy=false;$('rwReason').value='';rwRender(data);
    rwActionFeedback(action==='save'?'Data tersimpan. Pilih keputusan yang tersedia untuk melanjutkan.':`${rwLabels[action]||action} berhasil. Status risiko: ${data.effectiveStage||data.stage}.`,'success');
    try{await loadRiskManagement();rwRenderGuide(rwLiveData(),false);}catch(error){rwActionFeedback('Perubahan sudah tersimpan, tetapi daftar belum diperbarui. Gunakan Refresh data.','info');}
  }catch(error){rwActionFeedback(error.message||'Permintaan gagal. Coba kembali.','error');}
  finally{
    rwBusy=false;$('rwClose').disabled=false;
    if(rwData){$('rwSave').disabled=rwData.stage==='Closed'||!canPerform('risk-management','update');$('rwActions').querySelectorAll('button').forEach(button=>{button.disabled=false;});}
  }
}
$('riskWorkflowForm').addEventListener('submit', event => { event.preventDefault(); rwMutate('save'); });
$('riskWorkflowModal').addEventListener('cancel', event => { if (rwBusy) event.preventDefault(); });
$('riskManagementView').addEventListener('click', event => {
  const focus=event.target.closest('[data-rw-focus]');if(focus)rwFocusIssue(focus.dataset.rwFocus);
  const open = event.target.closest('[data-rw-open]'); if (open) rwOpen(open.dataset.rwOpen);
  if(event.target.closest('[data-rw-edit-register]')&&!rwBusy){if(rwFields.some(key=>String(rwData[key]??'')!==rwField(key).value)){$('rwStatus').textContent='Simpan perubahan workflow sebelum membuka Data risiko.';rwFocusIssue('rwSave');return;}const risk=riskManagementRows.find(row=>row.riskId===rwRiskId);if(risk&&canPerform('risk-management','update')){rwReturnAfterEdit=rwRiskId;$('riskWorkflowModal').close();fillRiskManagementForm(risk);}}
  if(event.target.closest('[data-rm-start]')){const button=$('riskManagementNewButton');if(!button.disabled&&!button.hidden)button.click();}
  if(event.target.closest('[data-rm-guide-register]')){setRiskManagementTab('register');$('riskRegisterPanel').scrollIntoView({block:'start'});$('riskRegisterSearch').focus({preventScroll:true});}

  if (event.target.closest('#rwClose') && !rwBusy) $('riskWorkflowModal').close();
});
$('riskRegisterForm').addEventListener('input', event => { if (['rmImpact', 'rmScenarioImpact'].includes(event.target.id)) updateRiskCalculations(); });
$('riskManagementModal').addEventListener('close',()=>{if(rwReturnAfterEdit&&!rmSaving){const id=rwReturnAfterEdit;rwReturnAfterEdit=null;rwOpen(id);}});
riskRegisterColumns.splice(1, 0, { field: 'workflowStatus', label: 'Workflow status' });

$('riskRegisterWorkflowFilter').addEventListener('change', () => { riskRegisterPage = 1; renderRiskRegister(); });

$('riskRegisterViewMode').addEventListener('change',()=>{renderRiskRegister();});

$('riskWorkflowForm').addEventListener('input',()=>{if(rwData&&!rwBusy)rwRenderGuide(rwLiveData(),false);});
$('riskWorkflowForm').addEventListener('change',()=>{if(rwData&&!rwBusy)rwRenderGuide(rwLiveData(),false);});
$('rwReason').addEventListener('input',()=>{if(rwData&&!rwBusy)rwRenderGuide(rwLiveData(),false);});
$('riskRegisterForm').addEventListener('input',()=>{if(rwData&&rwReturnAfterEdit===rwRiskId)rwApplyHighlights(rwGuidance(rwLiveData(),rwLiveRisk()).issues);});
$('riskRegisterForm').addEventListener('change',()=>{if(rwData&&rwReturnAfterEdit===rwRiskId)rwApplyHighlights(rwGuidance(rwLiveData(),rwLiveRisk()).issues);});

$('rwActions').addEventListener('click',event=>{const button=event.target.closest('[data-rw-action]');if(button){event.preventDefault();void rwMutate(button.dataset.rwAction);}});
