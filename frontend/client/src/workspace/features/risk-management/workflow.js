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
function rwGuidance(data,risk={}) {
  const stage=data.effectiveStage || data.stage;
  const messages={Draft:['Lengkapi penilaian risiko','Isi identifikasi dan inherent di Data risiko, lalu threat, vulnerability, alasan skor, dan current assessment di sini.'],Assessed:['Lengkapi rencana dan ajukan approval','Pilih treatment, PIC, dan deadline di Data risiko. Lengkapi tolerance, approver, reviewer, serta target residual di sini.'], 'Pending Approval':['Menunggu keputusan approver',`Akun approver: ${data.approver || 'belum dipilih'}. Pemohon tidak dapat menyetujui pengajuan sendiri.`], 'In Treatment':['Laksanakan rencana penanganan','Catat progress dan evidence. Ajukan verifikasi setelah progress 100% dan bukti tindakan tersedia.'], 'Pending Verification':['Periksa hasil dan residual aktual',`Reviewer: ${data.reviewer || 'belum dipilih'}. Lengkapi residual aktual di Data risiko, hasil verifikasi, dan review date di sini.`],Monitoring:['Pantau efektivitas kontrol','Catat evidence dan tanggal review berikutnya. Penutupan hanya bila sumber risiko hilang atau tidak relevan lagi.'],Accepted:['Pantau masa berlaku acceptance','Review berkala tetap diperlukan. Acceptance tidak diperpanjang otomatis.'], 'Pending Closure':['Menunggu persetujuan penutupan',`Akun approver: ${data.approver || 'belum dipilih'}. Periksa alasan dan evidence sebelum menyetujui.`],Closed:['Risiko telah ditutup','Histori tetap dapat dibaca. Gunakan Assessment ulang bila risiko perlu dibuka kembali.'], 'Review Required':['Assessment perlu diulang','Data atau masa berlaku berubah. Periksa penyebabnya, lalu gunakan Assessment ulang sebelum keputusan baru.']};
  const [title,description]=messages[stage] || ['Tinjau status risiko','Periksa data dan histori sebelum melanjutkan.'];
  const missing=[],issues=[];
  const addIssue=(source,key,label,where,reason='wajib diisi')=>{
    const location=source===risk?'register':'workflow',id=(location==='register'?'rm':'rw')+key[0].toUpperCase()+key.slice(1);
    if(issues.some(issue=>issue.id===id))return;
    missing.push(`${label} (${where})`);issues.push({id,location,label,where,reason});
  };
  const requireFields=(source,fields,where)=>fields.forEach(([key,label])=>{
    const value=source[key],text=String(value??'').trim();
    const score=['likelihood','impact','currentLikelihood','currentImpact','targetLikelihood','targetImpact','residualLikelihood','residualImpact'].includes(key);
    if(!text)addIssue(source,key,label,where);
    else if(score&&(!Number.isInteger(Number(value))||Number(value)<1||Number(value)>5))addIssue(source,key,label,where,'harus bernilai 1-5');
    else if(key==='toleranceScore'&&(!Number.isInteger(Number(value))||Number(value)<1||Number(value)>25))addIssue(source,key,label,where,'harus bernilai 1-25');
  });
  if(['Draft','Assessed'].includes(stage)){
    requireFields(risk,[['riskCategory','Kategori'],['effectedAsset','Aset'],['riskOwner','Risk owner'],['identificationRisk','Deskripsi risiko'],['riskCause','Penyebab'],['riskControl','Kontrol existing'],['riskAnalysis','Analisis'],['likelihood','Inherent likelihood'],['impact','Inherent impact']],'Data risiko');
    requireFields(data,[['threat','Threat'],['vulnerability','Vulnerability'],['likelihoodRationale','Alasan likelihood'],['impactRationale','Alasan impact'],['currentLikelihood','Current likelihood'],['currentImpact','Current impact']],'Penilaian');
  }
  if(stage==='Assessed'){
    requireFields(data,[['approver','Approver'],['reviewer','Reviewer'],['toleranceScore','Tolerance'],['toleranceRationale','Dasar tolerance']],'Alur risiko');
    requireFields(risk,[['treatmentAction','Treatment']],'Data risiko');
    if(risk.treatmentAction==='Acceptance')requireFields(data,[['acceptanceFormId','Form acceptance disahkan'],['acceptanceReason','Justifikasi'],['acceptanceConditions','Kondisi'],['acceptanceExpiry','Expiry'],['reviewDate','Review date']],'Acceptance');
    else {requireFields(risk,[['ownerOfAction','PIC'],['deadline','Deadline'],['riskTreatmentDescription','Rencana tindakan']],'Data risiko');requireFields(data,[['targetLikelihood','Target likelihood'],['targetImpact','Target impact']],'Alur risiko');}
  }
  if(stage==='In Treatment'){if(Number(data.progress)!==100)addIssue(data,'progress','Progress 100%','Pelaksanaan','harus mencapai 100%');requireFields(data,[['evidence','Evidence tindakan']],'Pelaksanaan');}
  if(stage==='Pending Verification'){requireFields(risk,[['residualLikelihood','Residual likelihood'],['residualImpact','Residual impact']],'Data risiko');requireFields(data,[['verificationNotes','Hasil verifikasi'],['evidence','Evidence'],['reviewDate','Review berikutnya']],'Verifikasi');}
  if(['Monitoring','Accepted'].includes(stage))requireFields(data,[['evidence','Evidence review'],['reviewDate','Review berikutnya']],'Review');
  if(stage==='Pending Closure')requireFields(data,[['closureReason','Alasan closure'],['evidence','Evidence penutupan']],'Penutupan');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const checkDate=(source,key,label,where,strict=false)=>{
    const value=String(source[key]??'');if(!value)return;
    const parsed=new Date(value+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)addIssue(source,key,label,where,'harus berupa tanggal kalender yang valid');
    else if(strict?value<=today:value<today)addIssue(source,key,label,where,strict?'harus setelah hari ini':'tidak boleh sebelum hari ini');
  };
  if(stage==='Assessed'){
    if(!['Acceptance','Mitigation','Transfer','Avoidance'].includes(risk.treatmentAction))addIssue(risk,'treatmentAction','Treatment','Data risiko','pilih Acceptance, Mitigation, Transfer, atau Avoidance');
    if(risk.treatmentAction==='Acceptance'){checkDate(data,'acceptanceExpiry','Expiry','Acceptance',true);checkDate(data,'reviewDate','Review date','Acceptance');if(data.reviewDate&&data.acceptanceExpiry&&data.reviewDate>data.acceptanceExpiry)addIssue(data,'reviewDate','Review date','Acceptance','tidak boleh melewati expiry');}
    else checkDate(risk,'deadline','Deadline','Data risiko');
  }
  if(['Pending Verification','Monitoring','Accepted'].includes(stage))checkDate(data,'reviewDate','Review berikutnya','Review',['Monitoring','Accepted'].includes(stage));
  return {title,description,missing,issues};
}
function rwLiveData() {
  return {...rwData,...Object.fromEntries(rwFields.map(key=>[key,rwField(key).value]))};
}
function rwLiveRisk() {
  const saved=riskManagementRows.find(row=>row.riskId===rwRiskId)||{};
  return $('riskManagementModal').open&&$('riskRegisterOriginalId').value===rwRiskId?{...saved,...riskManagementData()}:saved;
}
function rwApplyHighlights(issues) {
  document.querySelectorAll('.rw-needs-input').forEach(input=>{
    input.classList.remove('rw-needs-input');input.removeAttribute('aria-invalid');
    const hintId=input.id+'RequirementHint';
    const described=(input.getAttribute('aria-describedby')||'').split(' ').filter(id=>id&&id!==hintId).join(' ');
    if(described)input.setAttribute('aria-describedby',described);else input.removeAttribute('aria-describedby');
    $(hintId)?.remove();
  });
  for(const issue of issues){
    const input=$(issue.id);if(!input)continue;
    if(issue.location==='register'&&$('riskRegisterOriginalId').value!==rwRiskId)continue;
    input.classList.add('rw-needs-input');input.setAttribute('aria-invalid','true');
    const hint=document.createElement('small');hint.id=input.id+'RequirementHint';hint.className='rw-field-hint';hint.textContent=issue.reason;
    input.after(hint);input.setAttribute('aria-describedby',[(input.getAttribute('aria-describedby')||''),hint.id].filter(Boolean).join(' '));
  }
}
function rwFocusIssue(id) {
  if(rwBusy)return;
  const guide=rwGuidance(rwLiveData(),rwLiveRisk());
  const issue=guide.issues.find(item=>item.id===id);
  if(issue?.location==='register'){
    const risk=riskManagementRows.find(row=>row.riskId===rwRiskId);if(!risk||!canPerform('risk-management','update'))return;
    if(rwFields.some(key=>String(rwData[key]??'')!==rwField(key).value)){$('rwStatus').textContent='Simpan perubahan data workflow sebelum berpindah ke Data risiko.';rwFocusIssue('rwSave');return;}
    rwReturnAfterEdit=rwRiskId;$('riskWorkflowModal').close();fillRiskManagementForm(risk);
  }
  const input=$(id);if(!input)return;
  for(let parent=input.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
  const issues=[...guide.issues];if(!$('rwReason').value.trim()&&rwAvailable(rwLiveData()).length)issues.push({id:'rwReason',location:'workflow',reason:'wajib diisi sebelum menjalankan keputusan'});
  rwApplyHighlights(issues);
  input.scrollIntoView({block:'center',behavior:'smooth'});input.focus({preventScroll:true});
}
function rwRenderGuide(data,resetSections=true) {
  const risk=rwLiveRisk(),guide=rwGuidance(data,risk);
  const actions=rwAvailable(data),canEdit=canPerform('risk-management','update')&&data.stage!=='Closed';
  const issues=[...guide.issues];
  if(actions.length&&!$('rwReason').value.trim())issues.push({id:'rwReason',location:'workflow',label:'Alasan keputusan',where:'Keputusan',reason:'wajib diisi sebelum menjalankan keputusan'});
  const dirty=rwData&&rwFields.some(key=>String(rwData[key]??'')!==rwField(key).value);
  const action=actions[0],readyText=dirty?'Isian sudah lengkap. Klik Simpan data workflow, lalu jalankan keputusan.':action?`Isian yang diperiksa sudah lengkap. Klik ${rwLabels[action]} untuk melanjutkan.`:'Menunggu tindakan akun yang berwenang pada tahap ini.';
  $('rwGuide').innerHTML=`<p class="eyebrow">LANGKAH BERIKUTNYA</p><h4>${escapeHtml(issues.length?guide.title:action?'Siap: '+rwLabels[action]:guide.title)}</h4><p>${escapeHtml(issues.length?'Klik isian di bawah untuk langsung menuju bagian yang perlu diperbaiki.':readyText)}</p>${issues.length?`<p class="rw-missing-count">${issues.length} isian perlu dilengkapi atau diperbaiki</p><ul class="rw-missing-list">${issues.map(issue=>`<li>${canEdit?`<button type="button" data-rw-focus="${escapeHtml(issue.id)}"><strong>${escapeHtml(issue.label)}</strong><span>${escapeHtml(issue.reason)} - ${escapeHtml(issue.where)}${issue.location==='register'?' (buka Data risiko)':''}</span></button>`:`<strong>${escapeHtml(issue.label)}</strong><span>${escapeHtml(issue.reason)} - ${escapeHtml(issue.where)}</span>`}</li>`).join('')}</ul>`:''}${canEdit&&(!issues.length||dirty)?`<button type="button" class="button button-accent" data-rw-focus="${dirty?'rwSave':'rwReason'}">${dirty?'Simpan perubahan workflow':'Ke alasan / keputusan'}</button>`:''}${canEdit?'<button type="button" class="button button-quiet" data-rw-edit-register>Edit Data risiko</button>':''}<p class="muted">${escapeHtml(guide.description)}</p>`;
  rwApplyHighlights(issues);
  if(resetSections){const openSections=data.stage==='Draft'?[0]:data.stage==='Assessed'?(risk.treatmentAction==='Acceptance'?[1,2]:[1]):['Pending Closure','Accepted'].includes(data.stage)?[1,2]:[1];$('riskWorkflowForm').querySelectorAll('[data-rw-section]').forEach(section=>{section.open=openSections.includes(Number(section.dataset.rwSection));});}
}
function rwRender(data) {
  rwData = data;
  $('rwTitle').textContent = `Alur risiko ${rwRiskId}`;
  $('rwStage').textContent = `${data.effectiveStage || data.stage} · Versi ${data.version}`;
  const warnings = [];
  if (data.reviewRequired) warnings.push('Jadwal review telah jatuh tempo.');
  if (data.expired) warnings.push('Acceptance kedaluwarsa: lakukan assessment ulang.');
  if (data.assessmentChanged || data.acceptanceChanged) warnings.push('Data assessment atau form acceptance berubah; approval perlu diperbarui.');
  if (!data.history.length) warnings.push('Risiko ini belum melewati workflow baru. Data lama tidak dianggap sebagai persetujuan.');
  $('rwWarning').hidden = !warnings.length; $('rwWarning').textContent = warnings.join(' ');
  rwFields.forEach(key => { const input = rwField(key); input.value = data[key] ?? ''; input.disabled = rwBusy || data.stage === 'Closed' || !canPerform('risk-management', 'update'); });
  $('rwSave').disabled = rwBusy || data.stage === 'Closed' || !canPerform('risk-management', 'update');
  rwRenderGuide(data);
  $('rwActions').innerHTML = rwAvailable(data).map((action,index) => `<button type="button" class="button ${index===0 && action!=='reassess' ? 'button-accent' : 'button-quiet'}" data-rw-action="${action}" ${rwBusy ? 'disabled' : ''}>${escapeHtml(rwLabels[action])}</button>`).join('');
  $('rwHistory').innerHTML = data.history.length ? data.history.map(event => `<article class="rw-event"><strong>${escapeHtml(rwLabels[event.action] || event.action)} · ${escapeHtml(event.snapshot.stage)}</strong><p data-no-translate>${escapeHtml(event.reason)}</p><small>${escapeHtml(event.actor)} · ${(globalThis.NistI18n?.dateHtml?.(event.createdAt, { timeZone: 'Asia/Bangkok' }) ?? escapeHtml(new Date(event.createdAt).toLocaleString(globalThis.NistI18n?.locale || 'id-ID', { timeZone: 'Asia/Bangkok' })))}</small><details><summary>Detail assessment saat keputusan</summary><pre>${escapeHtml(JSON.stringify(event.snapshot, null, 2))}</pre></details></article>`).join('') : '<p class="muted">Belum ada keputusan workflow.</p>';
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
function rwActionFeedback(message,tone='info',reveal=true) {
  $('rwStatus').textContent=message;
  const status=$('rwActionStatus');status.textContent=message;status.dataset.tone=tone;status.hidden=false;
  if(reveal)status.scrollIntoView({block:'nearest'});
}
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
