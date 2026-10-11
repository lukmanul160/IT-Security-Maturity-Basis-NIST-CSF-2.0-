// Explicit findings are independent of maturity scores and free-form reasoning.
const assessmentGapState = new Map();
const gapPermissions = {csf:'assessment',privacy:'privacy-assessment',iso27001:'iso27001','iso27001-soa':'iso27001-soa'};
let gapContext = null;
let gapPage = 1;
function gapRows(framework) { return assessmentGapState.get(framework)?.rows || []; }
function assessmentGapButton(framework, code) {
  if (!canPerform(gapPermissions[framework],'read')) return '';
  const state=assessmentGapState.get(framework), rows=gapRows(framework).filter(row=>row.controlCode===code);
  const preview=rows.slice(0,3).map(row=>`<div class="assessment-gap-preview"><span class="gap-status ${row.status==='Closed'?'closed':'open'}">${row.status}</span><span class="assessment-gap-preview-description" title="${escapeHtml(row.description)}">${escapeHtml(row.description)}</span><small>${row.evidence.length?`${row.evidence.length} evidence`:'Evidence belum diunggah'}</small></div>`).join('');
  return `<div class="assessment-gap-cell"><small>${state?.error ? 'Gagal memuat gap' : state?.loaded ? `${rows.filter(row=>row.status==='Open').length} Open / ${rows.filter(row=>row.status==='Closed').length} Closed` : 'Memuat gap...'}</small>${preview}${rows.length>3?`<small>+${rows.length-3} gap lainnya</small>`:''}<button type="button" class="attachment-action-button" data-assessment-gaps="${framework}" data-gap-control="${escapeHtml(code)}">${rows.length?'Lihat semua gap':'Tambah / lihat gap'} ${state?.loaded ? `(${rows.length})` : ''}</button></div>`;
}
async function loadAssessmentGaps(framework) {
  if (!canPerform(gapPermissions[framework],'read')) return;
  const previous=assessmentGapState.get(framework) || {};
  try {
    const response=await fetch(`/api/assessment-gaps/${framework}`,{cache:'no-store'});
    const body=await response.json();
    if(!response.ok) throw Error(body.error || 'Gap gagal dimuat.');
    assessmentGapState.set(framework,{rows:body,loaded:true,error:''});
  } catch(error) {assessmentGapState.set(framework,{...previous,error:error.message});}
  renderGapSummaries();
  renderAssessmentGapTabs();
  document.querySelectorAll(`[data-assessment-gaps="${framework}"][data-gap-control]`).forEach(button=>{
    const code=button.dataset.gapControl;
    const cell=button.closest('.assessment-gap-cell');if(cell)cell.outerHTML=assessmentGapButton(framework,code);
  });
}
function renderGapSummaries() {
  document.querySelectorAll('[data-gap-summary]').forEach(panel=>{
    const frameworks=panel.dataset.gapSummary.split(',').filter(key=>canPerform(gapPermissions[key],'read'));
    const selected=panel.closest('.view')?.querySelector('[data-csf-tab].button-accent,[data-privacy-tab].button-accent');
    panel.hidden=!frameworks.length || Boolean(selected && (selected.dataset.csfTab || selected.dataset.privacyTab)!=='overview');
    const rows=frameworks.flatMap(gapRows), errors=frameworks.map(key=>assessmentGapState.get(key)?.error).filter(Boolean);
    const loaded=frameworks.length && frameworks.every(key=>assessmentGapState.get(key)?.loaded);
    const value=count=>loaded&&!errors.length?count:'—';
    panel.innerHTML=`<div class="section-heading compact"><div><p class="eyebrow">ASSESSMENT GAP MONITORING</p><h3>Pemantauan gap</h3><p class="muted">Gap yang dicatat pada item assessment, terpisah dari selisih skor maturity.</p></div><button type="button" class="button button-quiet" data-gap-refresh="${frameworks.join(',')}">Refresh gap</button></div><div class="gap-kpi-grid">${[['all','Total gap',rows.length],['Open','Open',rows.filter(row=>row.status==='Open').length],['Closed','Closed',rows.filter(row=>row.status==='Closed').length],['missing','Tanpa evidence',rows.filter(row=>!row.evidence.length).length]].map(([filter,label,count])=>`<button type="button" class="gap-kpi" data-gap-monitor="${frameworks.join(',')}" data-gap-filter="${filter}"><span>${label}</span><strong>${value(count)}</strong><small>Lihat item assessment</small></button>`).join('')}</div><div class="gap-completion"><span>Gap closed</span><meter min="0" max="${Math.max(rows.length,1)}" value="${rows.filter(row=>row.status==='Closed').length}"></meter><strong>${loaded&&!errors.length?(rows.length?Math.round(rows.filter(row=>row.status==='Closed').length/rows.length*100):0)+'%':'—'}</strong></div>${errors.length?`<p role="alert">${escapeHtml(errors.join(' '))}</p>`:''}`;
  });
}
function gapDialog() {
  let dialog=$('assessmentGapDialog');
  if(!dialog) {
    dialog=document.createElement('dialog');dialog.id='assessmentGapDialog';dialog.className='assessment-gap-dialog';
    dialog.innerHTML='<div class="gap-dialog-heading"><div><p class="eyebrow">ASSESSMENT GAPS</p><h3 id="gapDialogTitle"></h3></div><button type="button" class="button button-quiet" data-gap-close aria-label="Tutup gap">Tutup</button></div><p id="gapDialogMessage" role="status" aria-live="polite"></p><div id="gapDialogContent"></div>';
    document.body.append(dialog);
  }
  return dialog;
}
function gapControlTitle(row) {
  const controls=row.framework==='csf'?csfRows:row.framework==='privacy'?privacyRows:row.framework==='iso27001'?iso27001Rows:iso27001SoaRows;
  return controls.find(item=>item.id===row.controlCode)?.subcategory || row.controlCode;
}
function renderAssessmentGapTabs() {
  document.querySelectorAll('[data-gap-tab]').forEach(panel=>{
    const frameworks=panel.dataset.gapTab.split(',').filter(key=>canPerform(gapPermissions[key],'read'));
    const button=panel.closest('.view')?.querySelector('[data-csf-tab="gaps"],[data-privacy-tab="gaps"],[data-iso-tab="gaps"]');
    if(button)button.hidden=!frameworks.length;
    if(!panel.dataset.initialized){
      panel.dataset.initialized='true';panel.dataset.page='1';
      panel.innerHTML='<div class="page-heading"><div><p class="eyebrow">ASSESSMENT GAPS</p><h2>Daftar gap assessment</h2><p class="lede">Gap yang dicatat pada kontrol, beserta status dan evidence pendukung.</p></div><button type="button" class="button button-quiet" data-gap-tab-refresh>Refresh gap</button></div><div class="toolbar"><label class="search-box"><input type="search" data-gap-tab-search aria-label="Cari gap assessment" placeholder="Cari gap, ID kontrol, atau evidence..."></label><select data-gap-tab-status aria-label="Filter status gap"><option value="all">Semua gap</option><option value="Open">Open</option><option value="Closed">Closed</option><option value="missing">Tanpa evidence</option></select></div><p data-gap-tab-count role="status" aria-live="polite"></p><div class="gap-records" data-gap-tab-records></div><div class="list-pagination" data-gap-tab-pagination></div>';
    }
    const query=panel.querySelector('[data-gap-tab-search]').value.trim().toLowerCase(),filter=panel.querySelector('[data-gap-tab-status]').value;
    const all=frameworks.flatMap(gapRows),rows=all.filter(row=>(filter==='all'||row.status===filter||filter==='missing'&&!row.evidence.length)&&[row.description,row.controlCode,gapControlTitle(row),...row.evidence.map(file=>file.name)].join(' ').toLowerCase().includes(query));
    const errors=frameworks.map(key=>assessmentGapState.get(key)?.error).filter(Boolean),loaded=frameworks.every(key=>assessmentGapState.get(key)?.loaded);
    const pages=Math.max(1,Math.ceil(rows.length/8)),page=Math.min(Math.max(1,Number(panel.dataset.page)),pages);panel.dataset.page=String(page);
    panel.querySelector('[data-gap-tab-count]').textContent=errors.join(' ') || (!frameworks.length?'Akses gap assessment tidak tersedia.':!loaded?'Memuat gap...':`${rows.length} dari ${all.length} gap · ${all.filter(row=>row.status==='Open').length} Open / ${all.filter(row=>row.status==='Closed').length} Closed`);
    panel.querySelector('[data-gap-tab-records]').innerHTML=rows.slice((page-1)*8,page*8).map(row=>`<article class="gap-record"><div class="gap-record-top"><strong>${escapeHtml(row.controlCode)}</strong><span class="gap-status ${row.status==='Closed'?'closed':'open'}">${row.status}</span></div><small class="muted">${escapeHtml(gapControlTitle(row))}</small><p class="gap-description">${escapeHtml(row.description)}</p><div class="gap-evidence">${row.evidence.length?row.evidence.map(file=>`<a href="/api/files/${file.path.replace(/^uploads?\//,'').split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">${escapeHtml(file.name)}</a>`).join(''):'<span class="muted">Evidence belum diunggah</span>'}</div><button type="button" class="attachment-action-button" data-assessment-gaps="${row.framework}" data-gap-control="${escapeHtml(row.controlCode)}">Lihat detail / kelola gap</button></article>`).join('') || (loaded&&!errors.length?'<p class="muted">Belum ada gap yang sesuai filter.</p>':'');
    panel.querySelector('[data-gap-tab-pagination]').innerHTML=`<button type="button" data-gap-tab-page="${page-1}" ${page===1?'disabled':''}>Previous</button><span>${page} / ${pages}</span><button type="button" data-gap-tab-page="${page+1}" ${page===pages?'disabled':''}>Next</button>`;
  });
}
document.addEventListener('input',event=>{if(event.target.matches('[data-gap-tab-search]')){event.target.closest('[data-gap-tab]').dataset.page='1';renderAssessmentGapTabs();}});
document.addEventListener('change',event=>{if(event.target.matches('[data-gap-tab-status]')){event.target.closest('[data-gap-tab]').dataset.page='1';renderAssessmentGapTabs();}});
async function openAssessmentGaps(frameworks,code='',filter='all') {
  const dialog=gapDialog();gapContext={frameworks:frameworks.split(','),code,filter,editing:null};gapPage=1;
  $('gapDialogTitle').textContent=code?`Gap — ${code}`:'Pemantauan gap assessment';
  $('gapDialogMessage').textContent='Memuat gap...';if(!dialog.open)dialog.showModal();
  await Promise.all(gapContext.frameworks.map(loadAssessmentGaps));
  if(!dialog.open)return;
  renderGapDialog();
}
function renderGapDialog() {
  if(!gapContext)return;
  const {frameworks,code,filter,editing}=gapContext;
  const rows=frameworks.flatMap(gapRows).filter(row=>(!code||row.controlCode===code)&&(filter==='all'||row.status===filter||filter==='missing'&&!row.evidence.length));
  const pages=Math.max(1,Math.ceil(rows.length/8));gapPage=Math.min(Math.max(gapPage,1),pages);
  const errors=frameworks.map(key=>assessmentGapState.get(key)?.error).filter(Boolean);
  $('gapDialogMessage').textContent=errors.join(' ') || `${rows.length} gap${code?' pada item ini':''}`;
  const editable=code && frameworks.length===1 && canPerform(gapPermissions[frameworks[0]],'update');
  const editRow=editing?rows.find(row=>row.id===editing):null;
  const cards=rows.slice((gapPage-1)*8,gapPage*8).map(row=>`<article class="gap-record"><div class="gap-record-top"><strong>${escapeHtml(row.controlCode)}</strong><span class="gap-status ${row.status==='Closed'?'closed':'open'}">${row.status}</span></div><p class="gap-description">${escapeHtml(row.description)}</p><div class="gap-evidence">${row.evidence.length?row.evidence.map(file=>`<a href="/api/files/${file.path.replace(/^uploads?\//,'').split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">${escapeHtml(file.name)}</a>`).join(''):'<span class="muted">Evidence belum diunggah</span>'}</div><small class="muted">Diperbarui oleh ${escapeHtml(row.updatedBy||row.createdBy||'—')} · ${escapeHtml(new Date(row.updatedAt).toLocaleString('id-ID'))}</small><div class="gap-record-actions">${canPerform(gapPermissions[row.framework],'update')?`<button type="button" class="attachment-action-button" data-gap-edit="${row.id}" data-gap-framework="${row.framework}" data-gap-control="${escapeHtml(row.controlCode)}">Edit gap</button>`:''}${canPerform(gapPermissions[row.framework],'delete')?`<button type="button" class="attachment-action-button danger" data-gap-delete="${row.id}" data-gap-framework="${row.framework}" data-gap-control="${escapeHtml(row.controlCode)}">Hapus gap</button>`:''}</div></article>`).join('');
  $('gapDialogContent').innerHTML=`${editable?`<form id="assessmentGapForm" class="gap-form"><h4>${editRow?'Edit gap':'Tambah gap'}</h4><label>Deskripsi gap<textarea name="description" required maxlength="4000" rows="3" placeholder="Contoh: kurang poin a">${escapeHtml(editRow?.description||'')}</textarea></label><label>Status<select name="status"><option value="Open" ${editRow?.status!=='Closed'?'selected':''}>Open</option><option value="Closed" ${editRow?.status==='Closed'?'selected':''}>Closed</option></select></label><div id="gapDraftEvidence"></div>${canPerform('files','read')?'<label>Cari evidence<input id="gapEvidenceSearch" type="search" placeholder="Cari nama file, asal upload, atau konten terkait..." aria-label="Cari evidence untuk gap" autocomplete="off"></label><label>Pilih evidence yang sudah diunggah<select id="gapEvidenceSelect"><option value="">Pilih file...</option></select></label><small id="gapEvidenceSearchStatus" role="status" aria-live="polite"></small>':''}${canPerform('files','create')?'<label>Upload evidence<input name="files" type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp"></label>':''}<p class="muted">Evidence dapat ditambahkan nanti. Setiap gap memiliki evidence sendiri.</p><div class="gap-form-actions"><button class="button button-accent" type="submit">${editRow?'Simpan gap':'+ Tambah gap'}</button>${editRow?'<button type="button" class="button button-quiet" data-gap-cancel-edit>Batal edit</button>':''}</div></form>`:''}<div class="gap-records">${cards||'<p class="muted">Belum ada gap yang sesuai.</p>'}</div><div class="list-pagination"><button type="button" data-gap-page="${gapPage-1}" ${gapPage===1?'disabled':''}>Previous</button><span>${gapPage} / ${pages} · ${rows.length} gap</span><button type="button" data-gap-page="${gapPage+1}" ${gapPage===pages?'disabled':''}>Next</button></div>`;
  if(editable) {
    gapContext.draftEvidence=[...(editRow?.evidence||[])];gapContext.editingRow=editRow;
    renderGapDraftEvidence();void populateGapEvidence();
    $('assessmentGapForm').addEventListener('submit',saveAssessmentGap);
  }
}
function renderGapDraftEvidence() {
  if(!$('gapDraftEvidence'))return;
  $('gapDraftEvidence').innerHTML=(gapContext.draftEvidence||[]).map((file,index)=>`<div class="gap-draft-file"><span>${escapeHtml(file.name)}</span><button type="button" class="attachment-action-button" data-gap-unlink="${index}" aria-label="Lepaskan ${escapeHtml(file.name)}">Lepaskan</button></div>`).join('');
}
async function populateGapEvidence() {
  const select=$('gapEvidenceSelect');if(!select)return;
  const search=$('gapEvidenceSearch'),status=$('gapEvidenceSearchStatus');
  select.disabled=true;status.textContent='Memuat evidence...';
  search.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
  await refreshEvidenceLibrary();if(!select.isConnected)return;
  const files=[...selectableEvidenceRecords()];
  const filter=()=>{
    const matches=files.map((file,index)=>({file,index})).filter(({file})=>evidenceMatches(file,search.value));
    select.innerHTML='<option value="">'+(matches.length?'Pilih file...':'Tidak ada file yang sesuai pencarian')+'</option>'+matches.map(({file,index})=>`<option value="${index}">${escapeHtml(file.name)}${file.source?' — '+escapeHtml(file.source):''}</option>`).join('');
    select.disabled=!matches.length;
    status.textContent=evidenceLibraryError || `${matches.length} dari ${files.length} file tersedia`;
  };
  search.addEventListener('input',filter);filter();
  select.onchange=()=>{const file=files[Number(select.value)];if(select.value!==''&&file&&!gapContext.draftEvidence.some(item=>item.path===file.path)){gapContext.draftEvidence.push(evidenceReference(file));renderGapDraftEvidence();}select.value='';};
  if(evidenceLibraryError)$('gapDialogMessage').textContent=evidenceLibraryError;
}
async function saveAssessmentGap(event) {
  event.preventDefault();const form=event.target, context=gapContext,framework=context.frameworks[0],row=context.editingRow;
  const button=form.querySelector('[type="submit"]');button.disabled=true;$('gapDialogMessage').textContent='Menyimpan gap...';
  try {
    const files=[...(form.elements.files?.files||[])];
    if(files.length) {
      const source=framework==='iso27001'?'ISO 27001':framework==='iso27001-soa'?'ISO 27001 SOA':framework==='privacy'?'ID-P':'Govern';
      const uploaded=await saveFilesToServer(source,'practice',files);
      context.draftEvidence.push(...uploaded);form.elements.files.value='';renderGapDraftEvidence();
    }
    const response=await fetch(`/api/assessment-gaps/${framework}/${encodeURIComponent(context.code)}${row?'/'+row.id:''}`,{method:row?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:form.elements.description.value,status:form.elements.status.value,evidence:context.draftEvidence,updatedAt:row?.updatedAt})});
    const body=await response.json();if(!response.ok)throw Error(body.error||'Gap gagal disimpan.');
    context.editing=null;await loadAssessmentGaps(framework);renderGapDialog();
    window.dispatchEvent(new CustomEvent('assessment-gaps-changed',{detail:{framework}}));
  }catch(error){$('gapDialogMessage').textContent=error.message;}finally{button.disabled=false;}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.gapTabPage){button.closest('[data-gap-tab]').dataset.page=button.dataset.gapTabPage;renderAssessmentGapTabs();}
  if(button.hasAttribute('data-gap-tab-refresh'))void Promise.all(button.closest('[data-gap-tab]').dataset.gapTab.split(',').map(loadAssessmentGaps));
  if(button.dataset.assessmentGaps)void openAssessmentGaps(button.dataset.assessmentGaps,button.dataset.gapControl);
  if(button.dataset.gapMonitor)void openAssessmentGaps(button.dataset.gapMonitor,'',button.dataset.gapFilter);
  if(button.dataset.gapRefresh)void Promise.all(button.dataset.gapRefresh.split(',').map(loadAssessmentGaps));
  if(button.hasAttribute('data-gap-close'))$('assessmentGapDialog').close();
  if(button.dataset.gapPage){gapPage=Number(button.dataset.gapPage);renderGapDialog();}
  if(button.dataset.gapEdit){gapContext={frameworks:[button.dataset.gapFramework],code:button.dataset.gapControl,filter:'all',editing:button.dataset.gapEdit};$('gapDialogTitle').textContent=`Gap — ${gapContext.code}`;renderGapDialog();}
  if(button.hasAttribute('data-gap-cancel-edit')){gapContext.editing=null;renderGapDialog();}
  if(button.hasAttribute('data-gap-unlink')){gapContext.draftEvidence.splice(Number(button.dataset.gapUnlink),1);renderGapDraftEvidence();}
  if(button.dataset.gapDelete && confirm('Hapus gap ini? File evidence tetap tersedia di library.')){
    button.disabled=true;
    try{const row=gapRows(button.dataset.gapFramework).find(item=>item.id===button.dataset.gapDelete);const response=await fetch(`/api/assessment-gaps/${row.framework}/${encodeURIComponent(row.controlCode)}/${row.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({updatedAt:row.updatedAt})});if(!response.ok)throw Error((await response.json()).error||'Hapus gap gagal.');await loadAssessmentGaps(row.framework);renderGapDialog();window.dispatchEvent(new CustomEvent('assessment-gaps-changed',{detail:{framework:row.framework}}));}catch(error){$('gapDialogMessage').textContent=error.message;}finally{button.disabled=false;}
  }
});
