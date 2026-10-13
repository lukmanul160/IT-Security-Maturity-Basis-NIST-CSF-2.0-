let tprmLifecycleRow = null, tprmLifecycleData = null, tprmLifecycleTab = 'assessment';
const tprmLifecycleStages = ['Draft', 'Under review', 'Validated', 'Approved', 'Active', 'Offboarding', 'Closed'];
const tprmCriticalLabels = { access: 'Access control / MFA', encryption: 'Encryption & data protection', incident: 'Incident notification & response', continuity: 'Business continuity / recovery' };
const tprmContractLabels = { security: 'Persyaratan keamanan dan batas akses', incident: 'Kewajiban notifikasi dan koordinasi insiden', audit: 'Hak audit dan bukti kontrol', subprocessors: 'Ketentuan subkontraktor / subprocessor', dataExit: 'Pengembalian atau penghapusan data saat kontrak berakhir' };
const tprmExitLabels = { accessRevoked: 'Akses, akun, token, dan koneksi vendor sudah dicabut', dataResolved: 'Data dikembalikan / dihapus sesuai kewajiban dan bukti tersedia', obligationsResolved: 'Kewajiban kontrak dan tindakan terbuka sudah diselesaikan' };
function tprmInput(id, label, value = '', type = 'text') {
  return `<label>${label}<input id="${id}" type="${type}" value="${escapeHtml(value ?? '')}" ${type === 'date' ? '' : 'maxlength="1000"'}></label>`;
}
function tprmText(id, label, value = '') { return `<label>${label}<textarea id="${id}" rows="3" maxlength="5000">${escapeHtml(value || '')}</textarea></label>`; }
function tprmSelect(id, label, choices, value = '') {
  return `<label>${label}<select id="${id}">${choices.map(([key, title]) => `<option value="${escapeHtml(key)}" ${String(key) === String(value) ? 'selected' : ''}>${title}</option>`).join('')}</select></label>`;
}
function tprmChecks(prefix, labels, values = {}) {
  return `<div class="tprm-workflow-checks">${Object.entries(labels).map(([key, label]) => `<label><input id="${prefix}${key}" type="checkbox" ${values[key] ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>`;
}
function tprmWorkflowActions(actions) {
  const writable = canPerform('tprm-register', 'update');
  return `<div class="csf-form-actions">${actions.map(([action, label]) => `<button class="button ${['return','startOffboarding','close'].includes(action) ? 'button-quiet' : 'button-accent'}" type="submit" value="${action}" ${writable ? '' : 'disabled'}>${label}</button>`).join('')}</div>`;
}
function renderTprmConditions(actions = []) {
  $('twConditions').innerHTML = actions.map((item, index) => `<article class="insight-panel tprm-mitigation" data-tw-condition>
    <div class="section-heading compact"><h4>Mitigasi ${index + 1}</h4><button class="attachment-action-button danger" data-tw-remove-condition type="button">Remove</button></div>
    <div class="risk-register-grid"><label>Tindakan<input data-tw-field="description" value="${escapeHtml(item.description || '')}" maxlength="1000"></label><label>PIC<input data-tw-field="owner" value="${escapeHtml(item.owner || '')}" maxlength="200"></label><label>Tenggat<input data-tw-field="dueDate" type="date" value="${escapeHtml(item.dueDate || '')}"></label></div>
    <div class="tprm-workflow-checks"><label><input data-tw-field="preActivation" type="checkbox" ${item.preActivation !== false ? 'checked' : ''}>Wajib selesai sebelum aktivasi</label><label><input data-tw-field="completed" type="checkbox" ${item.completed ? 'checked' : ''}>Selesai dan diverifikasi</label></div>
    <label>Bukti verifikasi / referensi dokumen<textarea data-tw-field="evidence" rows="2" maxlength="3000">${escapeHtml(item.evidence || '')}</textarea></label></article>`).join('') || '<p class="muted">Belum ada tindakan mitigasi.</p>';
}
function readTprmConditions() {
  return [...document.querySelectorAll('[data-tw-condition]')].map(node => Object.fromEntries([...node.querySelectorAll('[data-tw-field]')].map(input => [input.dataset.twField, input.type === 'checkbox' ? input.checked : input.value])));
}
function tprmHistory(items, label) {
  return `<h4>${label}</h4>${items.map(item => {
    const snapshot=item.snapshot || {}, record=snapshot.record || snapshot.after || {}, workflow=record.workflow || {};
    const questionnaire=snapshot.questionnaire || snapshot.after || {}, responses=questionnaire.responses || {}, summary=snapshot.summary || {};
    const assessment=record.dueDiligenceAssessment || record.due_diligence_assessment || {};
    const values=[['Vendor',record.thirdParty || questionnaire.vendorName || questionnaire.vendor_name],['Workflow',workflow.stage],['Relationship',record.relationship_status || record.relationshipStatus],['Criticality',summary.tier],['Inherent risk',summary.inherent],['Residual risk',summary.residual],['CIA score',assessment.riskScore],['Due diligence score',responses.riskScore],['Decision',workflow.approval?.decision || questionnaire.result || questionnaire.assessment_result],['Reviewer',workflow.review?.by],['Approver',workflow.approval?.by]];
    const answers=(responses.questionnaireSections || []).map(([title,questions])=>`<h5>${escapeHtml(title)}</h5>${questions.map((question,index)=>{const key=`${title}-${index}`;return `<p><strong>${escapeHtml(question)}</strong><br>${escapeHtml(responses[`${key}-decision`] || 'Belum dijawab')} · ${escapeHtml(responses[key] || '-')}</p>`;}).join('')}`).join('');
    const documents=(responses.vendorDocuments || []).map(file=>`<a class="attachment-action-button" href="${apiFileOpenUrl(file.path)}" target="_blank" rel="noreferrer">${escapeHtml(file.name || file.path)}</a>`).join('');
    const plans=(workflow.conditions || []).map(plan=>`<p><strong>${escapeHtml(plan.description)}</strong> · ${escapeHtml(plan.owner)} · ${escapeHtml(plan.dueDate)} · ${plan.completed ? 'Selesai' : 'Terbuka'}<br>${escapeHtml(plan.evidence || '')}</p>`).join('');
    return `<details class="insight-panel tprm-history-entry"><summary>${escapeHtml(item.action || 'Questionnaire revision')} · ${escapeHtml(item.actor)} · ${(globalThis.NistI18n?.dateHtml?.(item.created_at, {year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}) ?? escapeHtml(new Date(item.created_at).toLocaleString(globalThis.NistI18n?.locale || 'id-ID', {year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'})))}</summary><div class="risk-register-grid">${values.filter(([,value])=>value!==undefined&&value!==null&&value!=='').map(([key,value])=>`<p><span class="muted">${key}</span><br><strong>${escapeHtml(value)}</strong></p>`).join('')}</div>${workflow.review?.notes ? `<p>${escapeHtml(workflow.review.notes)}</p>` : ''}${workflow.approval?.notes ? `<p>${escapeHtml(workflow.approval.notes)}</p>` : ''}${plans}<div class="attachment-actions">${documents}</div>${answers}</details>`;
  }).join('') || '<p class="muted">Belum ada riwayat.</p>'}`;
}
function renderTprmLifecycle() {
  const data = tprmLifecycleData, row = tprmLifecycleRow, summary = data.summary;
  const questionnaire = questionnaireForTprm(row);
  const profile = data.profile || {}, controls = data.criticalControls || {};
  const stale = data.review && !data.reviewed;
  const stage = stale && !['Closed','Offboarding'].includes(data.stage) ? 'Review required' : data.stage;
  $('tprmWorkflowTitle').textContent = `${row.thirdParty} · ${row.serviceDependency}`;
  $('tprmWorkflowSummary').innerHTML = `<div class="tprm-workflow-steps">${tprmLifecycleStages.map(name => `<span class="status-badge ${name === data.stage ? 'status-ok' : 'status-neutral'}">${name}</span>`).join('')}</div>
    <div class="hero-grid tprm-workflow-metrics"><article class="insight-panel"><p class="eyebrow">WORKFLOW</p><h3>${escapeHtml(stage)}</h3><p>${escapeHtml(data.relationshipStatus)}</p></article><article class="insight-panel"><p class="eyebrow">VENDOR CRITICALITY</p><h3>${escapeHtml(summary.tier)}</h3><p>Kritikalitas layanan dan akses</p></article><article class="insight-panel"><p class="eyebrow">RESIDUAL RISK</p><h3>${escapeHtml(summary.level)}${summary.residual === null ? '' : ` · ${summary.residual}/100`}</h3><p>Inherent: ${summary.inherent === null ? 'Belum dinilai' : `${summary.inherent}/100`}</p></article></div>
    <p class="muted">Kuesioner: ${summary.readiness.answered}/${summary.readiness.total} jawaban lengkap · ${summary.readiness.documents} dokumen. Review dan approval berlaku untuk versi assessment yang diperiksa.</p>
    ${data.alerts.length ? `<div class="tprm-workflow-alert" role="status">${data.alerts.map(alert => `<p>${escapeHtml(alert)}</p>`).join('')}</div>` : ''}
    ${data.approval ? `<p class="muted">Keputusan terakhir: ${escapeHtml(data.approval.decision)} · ${escapeHtml(data.approval.by)} · berlaku sampai ${escapeHtml(data.approval.expiresAt || '-')}</p>` : ''}
    ${data.returnReason ? `<p class="muted">Catatan pengembalian: ${escapeHtml(data.returnReason)}</p>` : ''}`;
  const scoringOptions = [['','Pilih'],[1,'1 · Rendah'],[2,'2 · Sedang'],[3,'3 · Tinggi']];
  const reviewer = ['admin','approver','editor'].includes(currentUserRole);
  const approver = ['admin','approver'].includes(currentUserRole);
  const closed = ['Offboarded','Terminated'].includes(data.relationshipStatus);
  let html = '';
  if (tprmLifecycleTab === 'assessment') {
    html = `<fieldset class="questionnaire-section"><legend>Profil dan kritikalitas vendor</legend><p class="muted">Nilai tertinggi menentukan tier. Skor due diligence dan CIA tetap terpisah dari kritikalitas.</p><div class="risk-register-grid">${tprmInput('twOwner','Pemilik hubungan / PIC internal',profile.owner)}${tprmSelect('twSensitivity','Sensitivitas data',scoringOptions,profile.dataSensitivity)}${tprmSelect('twAccess','Akses ke sistem',scoringOptions,profile.systemAccess)}${tprmSelect('twImpact','Dampak gangguan bisnis',scoringOptions,profile.businessImpact)}${tprmSelect('twReplacement','Kesulitan mengganti vendor',scoringOptions,profile.replaceability)}</div>${tprmText('twScope','Lingkup layanan, data, dan akses',profile.scope)}${tprmText('twNoRisks','Alasan hasil identifikasi tanpa gap (hanya jika tidak ada risiko terkait)',data.noRisksReason)}</fieldset>
      <article class="insight-panel"><h4>Kelengkapan assessment</h4><p class="muted">Jawab setiap pertanyaan dan isi keterangan. Untuk N/A, jelaskan alasannya. Lengkapi skor due diligence, dokumen pendukung, CIA, dan residual rating pada risiko terkait.</p><div class="csf-actions"><button type="button" class="button button-quiet" data-tw-questionnaire>Isi kuesioner & unggah bukti</button><button type="button" class="button button-quiet" data-tw-cia>Isi CIA assessment</button><button type="button" class="button button-quiet" data-tw-risks>Kelola risiko terkait</button></div></article>`;
  } else if (tprmLifecycleTab === 'review') {
    html = `<fieldset class="questionnaire-section"><legend>Validasi reviewer</legend><p class="muted">Identitas reviewer dicatat dari akun yang sedang login. Kontrol Fail menghalangi approval sampai perbaikan diverifikasi.</p><div class="risk-register-grid">${tprmInput('twEvidenceUntil','Masa berlaku / review ulang bukti',data.evidenceValidUntil,'date')}</div>${tprmChecks('tw',{evidenceVerified:'Jawaban dan semua dokumen bukti sudah diperiksa'}, {evidenceVerified:data.reviewed})}${tprmText('twReviewNotes','Catatan verifikasi atau alasan pengembalian',data.review?.notes)}${Object.entries(tprmCriticalLabels).map(([key,label]) => `<div class="risk-register-grid">${tprmSelect(`twCritical${key}`,label,[['','Pilih'],['Pass','Pass'],['Fail','Fail'],['N/A','N/A']],controls[key]?.status)}${tprmText(`twCriticalNotes${key}`,'Bukti kontrol / alasan N/A',controls[key]?.notes)}</div>`).join('')}</fieldset>`;
  } else if (tprmLifecycleTab === 'approval') {
    html = `<fieldset class="questionnaire-section"><legend>Keputusan approval</legend><p class="muted">Admin atau approver wajib berbeda dari reviewer. Risiko tinggi memerlukan alasan penerimaan risiko dan masa berlaku.</p><div class="risk-register-grid">${tprmSelect('twDecision','Keputusan',[['Approved','Approved'],['Approved with Conditions','Approved with Conditions'],['Rejected','Rejected']],data.approval?.decision)}${tprmInput('twApprovalUntil','Masa berlaku approval',data.approval?.expiresAt,'date')}</div>${tprmText('twApprovalNotes','Alasan keputusan',data.approval?.notes)}${tprmText('twRiskAcceptance','Alasan penerimaan risiko tinggi',data.approval?.riskAcceptance)}${tprmText('twAccessLimits','Batas akses selama approval bersyarat',data.approval?.accessLimits)}</fieldset>`;
  } else if (tprmLifecycleTab === 'monitoring') {
    html = `<fieldset class="questionnaire-section"><legend>Kontrak dan aktivasi</legend>${tprmChecks('twContract',tprmContractLabels,data.contract)}<div class="risk-register-grid">${tprmInput('twContractReference','Nomor / referensi dokumen kontrak',data.contractReference)}${tprmInput('twNextReview','Review berikutnya',riskDate(data.nextReview),'date')}</div><p class="muted">Review berikutnya paling lambat masa berlaku approval dan bukti. Semua mitigasi sebelum aktivasi wajib selesai.</p></fieldset>${tprmText('twMonitoringNotes','Catatan monitoring / alasan review ulang atau perubahan layanan',data.lastMonitoring?.notes)}`;
  } else if (tprmLifecycleTab === 'offboarding') {
    html = `<fieldset class="questionnaire-section"><legend>Penutupan hubungan vendor</legend>${tprmText('twExitNotes','Alasan penutupan dan catatan verifikasi',data.exit?.notes || data.exitReason)}${tprmChecks('twExit',tprmExitLabels,data.exit?.checklist)}<div class="risk-register-grid">${tprmSelect('twExitStatus','Status akhir',[['Offboarded','Offboarded'],['Terminated','Terminated']],data.relationshipStatus)}${tprmSelect('twExitEvidence','Dokumen bukti penutupan',[['','Pilih dokumen vendor'],...(questionnaire?.responses?.vendorDocuments || []).map(file => [file.path,escapeHtml(file.name || file.path)])],data.exit?.evidencePath)}</div><p class="muted">Unggah bukti penutupan melalui dokumen vendor di kuesioner, lalu pilih dokumennya di sini.</p></fieldset>`;
  } else html = tprmHistory(data.history,'Riwayat workflow dan snapshot assessment') + tprmHistory(data.questionnaireHistory,'Riwayat kuesioner');
  const withConditions = ['assessment','review','monitoring'].includes(tprmLifecycleTab);
  if (withConditions) html += '<fieldset class="questionnaire-section"><legend>Rencana mitigasi dan syarat</legend><div id="twConditions"></div><button class="button button-quiet" type="button" data-tw-add-condition>Add mitigation</button></fieldset>';
  const actions = [];
  if (!closed) {
    if (tprmLifecycleTab === 'assessment' && ['Draft','Incomplete','Changes requested','Mitigation','Review required','Active','Approved','Rejected'].includes(stage)) actions.push(['save','Save profile & mitigation']);
    if (tprmLifecycleTab === 'assessment' && ['Draft','Incomplete','Changes requested','Mitigation','Review required','Rejected'].includes(stage)) actions.push(['submit','Submit for review']);
    if (tprmLifecycleTab === 'review' && reviewer && ['Under review','Mitigation'].includes(stage)) actions.push(['review','Validate assessment']);
    if (tprmLifecycleTab === 'review' && reviewer && ['Under review','Validated','Mitigation'].includes(stage)) actions.push(['return','Return for changes']);
    if (tprmLifecycleTab === 'approval' && approver && ['Validated','Mitigation'].includes(stage)) actions.push(['approve','Save decision']);
    if (tprmLifecycleTab === 'monitoring' && stage === 'Approved') actions.push(['activate','Verify contract & activate']);
    if (tprmLifecycleTab === 'monitoring' && data.relationshipStatus === 'Active') actions.push(['monitor','Save monitoring']);
    if (tprmLifecycleTab === 'monitoring' && (data.relationshipStatus === 'Active' || ['Approved','Rejected','Validated','Mitigation'].includes(data.stage))) actions.push(['reassess','Start reassessment']);
    if (tprmLifecycleTab === 'offboarding' && ['Active','Expired','Pending'].includes(data.relationshipStatus)) actions.push(['startOffboarding','Start offboarding']);
    if (tprmLifecycleTab === 'offboarding' && data.stage === 'Offboarding' && reviewer) actions.push(['close','Verify & close relationship']);
  }
  $('tprmWorkflowFields').innerHTML = html + tprmWorkflowActions(actions);
  if (withConditions) renderTprmConditions(data.conditions || []);
  document.querySelectorAll('[data-tw-tab]').forEach(button => { const selected = button.dataset.twTab === tprmLifecycleTab; button.classList.toggle('button-accent',selected); button.classList.toggle('button-quiet',!selected); button.setAttribute('aria-selected',String(selected)); });
  if (closed || !canPerform('tprm-register','update')) $('tprmWorkflowFields').querySelectorAll('input,textarea,select,[data-tw-add-condition],[data-tw-remove-condition]').forEach(input => { input.disabled = true; });
}
async function openTprmLifecycle(row) {
  tprmLifecycleRow = row;
  const response = await fetch(`/api/tprm/${row.id}/workflow`,{cache:'no-store'});
  if (!response.ok) { $('tprmStatus').textContent = (await response.json()).error || 'Workflow unavailable'; return; }
  tprmLifecycleData = await response.json();
  const stage = tprmLifecycleData.stage;
  tprmLifecycleTab = stage === 'Under review' || stage === 'Mitigation' ? 'review' : stage === 'Validated' ? 'approval' : ['Approved','Active'].includes(stage) ? 'monitoring' : ['Offboarding','Closed'].includes(stage) ? 'offboarding' : 'assessment';
  $('tprmWorkflowStatus').textContent = 'Ready'; renderTprmLifecycle(); $('tprmWorkflowModal').showModal();
}
async function saveTprmLifecycle(event) {
  event.preventDefault(); const action = event.submitter?.value;
  if (!action || !tprmLifecycleRow) return;
  const val = id => $(id)?.value || '', checked = id => $(id)?.checked === true;
  const data = { action, conditions: $('twConditions') ? readTprmConditions() : tprmLifecycleData.conditions || [] };
  if (action === 'save') Object.assign(data,{profile:{owner:val('twOwner'),dataSensitivity:val('twSensitivity'),systemAccess:val('twAccess'),businessImpact:val('twImpact'),replaceability:val('twReplacement'),scope:val('twScope')},noRisksReason:val('twNoRisks')});
  if (['review','return'].includes(action)) Object.assign(data,{notes:val('twReviewNotes'),evidenceVerified:checked('twevidenceVerified'),evidenceValidUntil:val('twEvidenceUntil'),criticalControls:Object.fromEntries(Object.keys(tprmCriticalLabels).map(key => [key,{status:val(`twCritical${key}`),notes:val(`twCriticalNotes${key}`)}]))});
  if (action === 'approve') Object.assign(data,{decision:val('twDecision'),notes:val('twApprovalNotes'),expiresAt:val('twApprovalUntil'),riskAcceptance:val('twRiskAcceptance'),accessLimits:val('twAccessLimits')});
  if (action === 'activate') Object.assign(data,{contract:Object.fromEntries(Object.keys(tprmContractLabels).map(key => [key,checked(`twContract${key}`)])),contractReference:val('twContractReference'),nextReview:val('twNextReview')});
  if (['monitor','reassess'].includes(action)) data.notes = val('twMonitoringNotes');
  if (['startOffboarding','close'].includes(action)) Object.assign(data,{notes:val('twExitNotes'),exitChecklist:Object.fromEntries(Object.keys(tprmExitLabels).map(key => [key,checked(`twExit${key}`)])),exitEvidencePath:val('twExitEvidence'),relationshipStatus:val('twExitStatus')});
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
  const tab = event.target.closest('[data-tw-tab]'); if (tab) {tprmLifecycleTab = tab.dataset.twTab;renderTprmLifecycle();}
  if (event.target.closest('[data-tw-add-condition]')) renderTprmConditions([...readTprmConditions(),{}]);
  const remove = event.target.closest('[data-tw-remove-condition]'); if (remove) {const node = remove.closest('[data-tw-condition]');node.remove();}
  if (event.target.closest('[data-tw-questionnaire]')) { const row = questionnaireForTprm(tprmLifecycleRow);if(row){$('tprmWorkflowModal').close();startQuestionnaire(row);} }
  if (event.target.closest('[data-tw-cia]')) {$('tprmWorkflowModal').close();chooseTprmAssessmentType(tprmLifecycleRow);}
  if (event.target.closest('[data-tw-risks]')) {$('tprmWorkflowModal').close();openRiskRegisterForTprm(tprmLifecycleRow);}
});
$('tprmBody').addEventListener('click',event => {const button = event.target.closest('[data-tprm-workflow]');if(button){const row=tprmRows.find(item=>String(item.id)===button.dataset.tprmWorkflow);if(row)openTprmLifecycle(row).catch(error=>{$('tprmStatus').textContent=error.message;});}});
