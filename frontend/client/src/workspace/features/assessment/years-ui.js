const assessmentPeriodViews = {csf:['csfView','assessmentView','csfManageView'],privacy:['privacyView','privacyAssessmentView','privacyManageView'],iso27001:['iso27001View'],ikas:['ikasView','ikasAssessmentView','ikasManageView']};
function canCreateAssessmentYear(group) {
  return (group === 'iso27001' ? ['iso27001','iso27001-soa'] : [group === 'csf' ? 'assessment' : group+'-assessment']).every(key => canPerform(key,'create'));
}
function canDeleteAssessmentYear(group) {
  return (group === 'iso27001' ? ['iso27001','iso27001-soa'] : [group === 'csf' ? 'assessment' : group+'-assessment']).every(key => canPerform(key,'delete') && canPerform(key,'read'));
}
async function openDeleteAssessmentYearDialog(group) {
  if(document.querySelector('form[aria-busy="true"]')||document.querySelector('.upload-progress.is-indeterminate'))throw new Error('Selesaikan penyimpanan atau upload sebelum menghapus tahun.');
  const periods=await assessmentPeriodsFor(group),year=assessmentYears[group];
  if(periods.length<=1)throw new Error('Assessment terakhir tidak dapat dihapus. Buat tahun lain terlebih dahulu.');
  const dialog=document.createElement('dialog');dialog.className='assessment-year-dialog';
  dialog.innerHTML=`<form><h2>Hapus assessment ${year}?</h2><p>Seluruh hasil, kontrol, catatan, gap, dan referensi evidence untuk tahun ${year} akan dihapus permanen${group==='iso27001'?', termasuk SOA dan sasaran ISO':''}. Tahun lain dan file evidence tetap tersimpan.</p><label>Ketik ${year} untuk konfirmasi<input name="confirmation" required autocomplete="off" pattern="${year}"></label><p role="status" aria-live="polite"></p><div class="assessment-year-actions"><button type="submit" class="button button-quiet danger">Hapus assessment ${year}</button><button type="button" class="button button-quiet" data-cancel>Batal</button></div></form>`;
  dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();const form=event.currentTarget,buttons=[...form.querySelectorAll('button')];
    if(form.elements.confirmation.value!==String(year))return;
    buttons.forEach(button=>button.disabled=true);form.setAttribute('aria-busy','true');
    try {
      await Promise.allSettled([...assessmentPendingWrites]);
      if(assessmentWriteErrors.has(group))throw new Error('Penyimpanan gagal. Simpan kembali perubahan sebelum menghapus tahun.');
      const response=await fetch(`/api/assessment-periods/${group}/${year}`,{method:'DELETE'});
      if(!response.ok)throw new Error((await response.json().catch(()=>({}))).error||'Assessment gagal dihapus.');
      assessmentPeriodLists.delete(group);
      const remaining=await assessmentPeriodsFor(group);
      assessmentYears[group]=remaining[0].year;
      localStorage.setItem(assessmentPeriodStorage,JSON.stringify(assessmentYears));location.reload();
    } catch(error){form.querySelector('[role=status]').textContent=error.message;buttons.forEach(button=>button.disabled=false);form.removeAttribute('aria-busy');}
  };
  dialog.addEventListener('cancel',event=>{if(dialog.querySelector('form').hasAttribute('aria-busy'))event.preventDefault();});
  dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
async function selectAssessmentYear(group,year,status) {
  if (document.querySelector('form[aria-busy="true"]') || document.querySelector('.upload-progress.is-indeterminate')) {
    status.textContent = 'Selesaikan penyimpanan atau upload sebelum mengganti tahun.'; return;
  }
  status.textContent = 'Menunggu penyimpanan selesai...';
  await Promise.allSettled([...assessmentPendingWrites]);
  if(assessmentWriteErrors.has(group)){status.textContent='Penyimpanan gagal. Simpan kembali perubahan sebelum mengganti tahun.';return;}
  assessmentYears[group] = Number(year);
  localStorage.setItem(assessmentPeriodStorage,JSON.stringify(assessmentYears));
  location.reload();
}
async function openAssessmentYearDialog(group) {
  if(document.querySelector('form[aria-busy="true"]')||document.querySelector('.upload-progress.is-indeterminate'))throw new Error('Selesaikan penyimpanan atau upload sebelum membuat tahun baru.');
  const periods = await assessmentPeriodsFor(group), current = assessmentYears[group];
  const dialog = document.createElement('dialog');dialog.className = 'assessment-year-dialog';
  dialog.innerHTML = `<form><h2>Buat assessment per tahun</h2><p>Tahun sebelumnya tetap tersimpan. ISO 27001 dan SOA menggunakan tahun yang sama.</p><label>Tahun tujuan<input name="year" type="number" min="2000" max="2100" required value="${Math.min(2100,Math.max(...periods.map(row=>row.year))+1)}"></label><label>Pilihan<select name="mode"><option value="new">New - mulai penilaian kosong</option><option value="duplicate">Duplicate - salin hasil tahun sumber</option></select></label><label>Tahun sumber struktur / assessment<select name="sourceYear">${periods.map(row=>`<option value="${row.year}" ${row.year===current?'selected':''}>${row.year}</option>`).join('')}</select></label><p data-year-explanation>New menyalin struktur kontrol dengan skor, catatan, gap, dan evidence kosong.</p><p role="status" aria-live="polite"></p><div class="assessment-year-actions"><button type="submit" class="button button-accent">Buat assessment</button><button type="button" class="button button-quiet" data-year-cancel>Batal</button></div></form>`;
  dialog.querySelector('[data-year-cancel]').onclick = () => dialog.close();
  dialog.querySelector('[name=mode]').onchange = event => {
    dialog.querySelector('[data-year-explanation]').textContent = event.target.value === 'duplicate'
      ? 'Duplicate menyalin skor, target maturity, catatan, gap, sasaran ISO, dan referensi evidence. File evidence tetap memakai file yang sudah tersedia.'
      : 'New menyalin struktur kontrol dengan skor, catatan, gap, sasaran ISO, dan evidence kosong.';
  };
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget, status = form.querySelector('[role=status]'), buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button => button.disabled = true);form.setAttribute('aria-busy','true');
    try {
      const year = Number(form.elements.year.value);
      if (periods.some(row => row.year === year)) throw new Error('Assessment tahun tersebut sudah tersedia. Pilih dari daftar tahun.');
      await Promise.allSettled([...assessmentPendingWrites]);
      if(assessmentWriteErrors.has(group))throw new Error('Penyimpanan gagal. Simpan kembali perubahan assessment terlebih dahulu.');
      const response = await fetch(`/api/assessment-periods/${group}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year,mode:form.elements.mode.value,sourceYear:Number(form.elements.sourceYear.value)})});
      if (!response.ok) throw new Error((await response.json().catch(()=>({}))).error || 'Assessment gagal dibuat.');
      assessmentYears[group] = year;localStorage.setItem(assessmentPeriodStorage,JSON.stringify(assessmentYears));
      location.reload();
    } catch(error) { status.textContent = error.message;buttons.forEach(button=>button.disabled=false);form.removeAttribute('aria-busy'); }
  });
  dialog.addEventListener('cancel',event=>{if(dialog.querySelector('form').hasAttribute('aria-busy'))event.preventDefault();});
  dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();
}
async function installAssessmentPeriods() {
  for (const [group,views] of Object.entries(assessmentPeriodViews)) {
    for (const id of views) {
      const view = $(id);if (!view || view.querySelector('[data-assessment-period]'))continue;
      const toolbar = document.createElement('div');toolbar.className = 'assessment-year-toolbar';toolbar.dataset.assessmentPeriod = group;
      toolbar.innerHTML = '<label>Tahun assessment <select aria-label="Tahun assessment"></select></label><button type="button" class="button button-quiet">+ New / Duplicate</button><button type="button" class="button button-quiet danger" data-delete-assessment-year disabled>Hapus tahun</button><span role="status" aria-live="polite">Memuat tahun...</span>';
      view.prepend(toolbar);
      const select = toolbar.querySelector('select'), button = toolbar.querySelector('button'), status = toolbar.querySelector('[role=status]');
      button.onclick = () => void openAssessmentYearDialog(group).catch(error=>{status.textContent=error.message;});
      const deleteButton=toolbar.querySelector('[data-delete-assessment-year]');
      deleteButton.onclick=()=>void openDeleteAssessmentYearDialog(group).catch(error=>{status.textContent=error.message;});
      select.onchange = () => {select.disabled=true;button.disabled=true;deleteButton.disabled=true;void selectAssessmentYear(group,select.value,status).finally(()=>{select.value=String(assessmentYears[group]);select.disabled=false;button.disabled=!canCreateAssessmentYear(group);deleteButton.disabled=!canDeleteAssessmentYear(group);});};
      button.disabled = true;
      void assessmentPeriodsFor(group).then(periods => {
        select.replaceChildren(...periods.map(row => {const option=document.createElement('option');option.value=row.year;option.textContent=row.year;return option;}));
        select.value = assessmentYears[group];status.textContent = `Assessment ${assessmentYears[group]}`;button.disabled = !canCreateAssessmentYear(group);
        deleteButton.disabled=periods.length<=1||!canDeleteAssessmentYear(group);
      }).catch(error => {status.textContent=error.message;select.disabled=true;});
    }
  }
}
void installAssessmentPeriods();
// Permissions arrive asynchronously during workspace startup.
fetch('/api/auth/me',{cache:'no-store'}).then(response=>response.ok?response.json():null).then(user=>{
  if(!user)return;
  if(uiState.view==='assessment'&&(user.role==='admin'||user.permissions?.includes('assessment')))showAssessment(activeFunction);
  else if(uiState.view==='privacy-assessment'&&(user.role==='admin'||user.permissions?.includes('privacy-assessment')))Promise.resolve(privacyDataReady).then(()=>showPrivacyAssessment(uiState.function));
  else if(uiState.view==='iso27001'||uiState.view==='iso27001-soa')document.querySelector('[data-view=iso27001]')?.click();
  for(const toolbar of document.querySelectorAll('[data-assessment-period]')) {
    const group=toolbar.dataset.assessmentPeriod;
    const keys=group==='iso27001'?['iso27001','iso27001-soa']:[group==='csf'?'assessment':group+'-assessment'];
    toolbar.querySelector('button').disabled=!(user.role==='admin'||keys.every(key=>user.actions?.[key]?.read&&user.actions?.[key]?.create));
    assessmentPeriodsFor(toolbar.dataset.assessmentPeriod).then(periods=>{toolbar.querySelector('[data-delete-assessment-year]').disabled=periods.length<=1||!(user.role==='admin'||keys.every(key=>user.actions?.[key]?.read&&user.actions?.[key]?.delete));}).catch(()=>{});
  }
}).catch(()=>{});
