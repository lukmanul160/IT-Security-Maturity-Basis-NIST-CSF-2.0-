/**
 * Adapter UI Risk Workflow: draft form, render, status dan fokus isian.
 * Tidak mengirim keputusan; permintaan API ditangani workflow.js.
 * State bersama dan ID DOM dipertahankan melalui manifest runtime.
 */
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

function rwActionFeedback(message,tone='info',reveal=true) {
  $('rwStatus').textContent=message;
  const status=$('rwActionStatus');status.textContent=message;status.dataset.tone=tone;status.hidden=false;
  if(reveal)status.scrollIntoView({block:'nearest'});
}
