/**
 * Adapter tampilan gap: ringkasan, tab, dialog, field dan daftar evidence.
 * Pembacaan/pengiriman API didelegasikan ke gaps.js. Renderer menggunakan
 * konteks edit aktif; ID DOM dan urutan event tidak diubah.
 */
function assessmentGapButton(framework, code) {
  if (!canPerform(gapPermissions[framework],'read')) return '';
  const state=assessmentGapState.get(framework), rows=gapRows(framework).filter(row=>row.controlCode===code);
  const preview=rows.slice(0,3).map(row=>`<div class="assessment-gap-preview"><span class="gap-status ${row.status==='Closed'?'closed':'open'}">${row.status}</span><span class="assessment-gap-preview-description" title="${escapeHtml(row.description)}">${escapeHtml(row.description)}</span><small>${row.evidence.length?`${row.evidence.length} evidence`:'Evidence belum diunggah'}</small></div>`).join('');
  return `<div class="assessment-gap-cell"><small>${state?.error ? 'Gagal memuat gap' : state?.loaded ? `${rows.filter(row=>row.status==='Open').length} Open / ${rows.filter(row=>row.status==='Closed').length} Closed` : 'Memuat gap...'}</small>${preview}${rows.length>3?`<small>+${rows.length-3} gap lainnya</small>`:''}<button type="button" class="attachment-action-button" data-assessment-gaps="${framework}" data-gap-control="${escapeHtml(code)}">${rows.length?'Lihat semua gap':'Tambah / lihat gap'} ${state?.loaded ? `(${rows.length})` : ''}</button></div>`;
}

function renderGapSummaries() {
  document.querySelectorAll('[data-gap-summary]').forEach(panel=>{
    const frameworks=panel.dataset.gapSummary.split(',').filter(key=>canPerform(gapPermissions[key],'read'));
    const selected=panel.closest('.view')?.querySelector('[data-csf-tab].button-accent,[data-privacy-tab].button-accent');
    panel.hidden=!frameworks.length || Boolean(selected && (selected.dataset.csfTab || selected.dataset.privacyTab)!=='overview');
    const rows=frameworks.flatMap(gapRows), errors=frameworks.map(key=>assessmentGapState.get(key)?.error).filter(Boolean);
    const loaded=frameworks.length && frameworks.every(key=>assessmentGapState.get(key)?.loaded);
    const value=count=>loaded&&!errors.length?count:'—';
    panel.innerHTML=`<div class="section-heading compact"><div><p class="eyebrow">ASSESSMENT GAP MONITORING</p><h3>Pemantauan gap</h3><p class="muted">Gap yang dicatat pada item assessment, terpisah dari selisih skor maturity.</p></div><button type="button" class="button button-quiet" data-gap-refresh="${frameworks.join(',')}">Refresh gap</button></div><div class="gap-kpi-grid">${[['all','Total gap',rows.length],['Open','Open',rows.filter(row=>row.status==='Open').length],['Closed','Closed',rows.filter(row=>row.status==='Closed').length],['missing','Tanpa evidence',rows.filter(row=>!row.evidence.length).length]].map(([filter,label,count])=>`<div class="dashboard-help-wrap"><button type="button" class="gap-kpi" data-gap-monitor="${frameworks.join(',')}" data-gap-filter="${filter}"><span>${label}</span><strong>${value(count)}</strong><small>Lihat item assessment</small></button><button type="button" class="dashboard-help-button" data-dashboard-help aria-label="Penjelasan ${label}">?</button></div>`).join('')}</div><div class="gap-completion"><span>Gap closed</span><meter min="0" max="${Math.max(rows.length,1)}" value="${rows.filter(row=>row.status==='Closed').length}"></meter><strong>${loaded&&!errors.length?(rows.length?Math.round(rows.filter(row=>row.status==='Closed').length/rows.length*100):0)+'%':'—'}</strong></div>${errors.length?`<p role="alert">${escapeHtml(errors.join(' '))}</p>`:''}`;
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

function gapDetailsHtml(row) {
  const details=gapLinkedDetails(row.framework,row.controlCode,row.details);
  return `<dl class="gap-detail-list">${gapDetailFields.map(([key,label])=>{
    const value=details[key] || '?',wide=value.length>80 || /[\r\n]/.test(value);
    return `<div class="gap-detail-item${wide?' gap-detail-wide':''}"><dt>${escapeHtml(label)}</dt><dd style="white-space:pre-wrap">${escapeHtml(value)}</dd></div>`;
  }).join('')}</dl>`;
}

function renderAssessmentGapTabs() {
  document.querySelectorAll('[data-gap-tab]').forEach(panel=>{
    const frameworks=panel.dataset.gapTab.split(',').filter(key=>canPerform(gapPermissions[key],'read'));
    const button=panel.closest('.view')?.querySelector('[data-csf-tab="gaps"],[data-privacy-tab="gaps"],[data-iso-tab="gaps"]');
    if(button)button.hidden=!frameworks.length;
    if(!panel.dataset.initialized){
      panel.dataset.initialized='true';panel.dataset.page='1';
      panel.innerHTML='<div class="page-heading"><div><p class="eyebrow">ASSESSMENT GAPS</p><h2>Daftar gap assessment</h2><p class="lede">Gap yang dicatat pada kontrol, beserta status dan evidence pendukung.</p></div><button type="button" class="button button-quiet" data-gap-export>Export Excel Gap</button><button type="button" class="button button-quiet" data-gap-tab-refresh>Refresh gap</button></div><div class="toolbar"><label class="search-box"><input type="search" data-gap-tab-search aria-label="Cari gap assessment" placeholder="Cari gap, ID kontrol, atau evidence..."></label><select data-gap-tab-status aria-label="Filter status gap"><option value="all">Semua gap</option><option value="Open">Open</option><option value="Closed">Closed</option><option value="missing">Tanpa evidence</option></select></div><p data-gap-tab-count role="status" aria-live="polite"></p><div class="gap-records" data-gap-tab-records></div><div class="list-pagination" data-gap-tab-pagination></div>';
    }
    const query=panel.querySelector('[data-gap-tab-search]').value.trim().toLowerCase(),filter=panel.querySelector('[data-gap-tab-status]').value;
    const all=frameworks.flatMap(gapRows),rows=all.filter(row=>(filter==='all'||row.status===filter||filter==='missing'&&!row.evidence.length)&&[row.description,row.controlCode,gapControlTitle(row),...Object.values(row.details||{}),...row.evidence.map(file=>file.name)].join(' ').toLowerCase().includes(query));
    const errors=frameworks.map(key=>assessmentGapState.get(key)?.error).filter(Boolean),loaded=frameworks.every(key=>assessmentGapState.get(key)?.loaded);
    const pages=Math.max(1,Math.ceil(rows.length/8)),page=Math.min(Math.max(1,Number(panel.dataset.page)),pages);panel.dataset.page=String(page);
    panel.querySelector('[data-gap-tab-count]').textContent=errors.join(' ') || (!frameworks.length?'Akses gap assessment tidak tersedia.':!loaded?'Memuat gap...':`${rows.length} dari ${all.length} gap · ${all.filter(row=>row.status==='Open').length} Open / ${all.filter(row=>row.status==='Closed').length} Closed`);
    panel.querySelector('[data-gap-tab-records]').innerHTML=rows.slice((page-1)*8,page*8).map((row,index)=>`<article class="gap-record"><small>No ${(page-1)*8+index+1}</small><div class="gap-record-top"><strong>${escapeHtml(row.controlCode)}</strong><span class="gap-status ${row.status==='Closed'?'closed':'open'}">${row.status}</span></div><small class="muted">${escapeHtml(gapControlTitle(row))}</small><p class="gap-description">${escapeHtml(row.description)}</p>${gapDetailsHtml(row)}<div class="gap-evidence">${row.evidence.length?row.evidence.map(file=>`<a href="/api/files/${file.path.replace(/^uploads?\//,'').split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">${escapeHtml(file.name)}</a>`).join(''):'<span class="muted">Evidence belum diunggah</span>'}</div><button type="button" class="attachment-action-button" data-assessment-gaps="${row.framework}" data-gap-control="${escapeHtml(row.controlCode)}" data-gap-edit-only="${row.id}">${canPerform(gapPermissions[row.framework],'update')?'Edit gap':'Lihat gap'}</button></article>`).join('') || (loaded&&!errors.length?'<p class="muted">Belum ada gap yang sesuai filter.</p>':'');
    panel.querySelector('[data-gap-tab-pagination]').innerHTML=`<button type="button" data-gap-tab-page="${page-1}" ${page===1?'disabled':''}>Previous</button><span>${page} / ${pages}</span><button type="button" data-gap-tab-page="${page+1}" ${page===pages?'disabled':''}>Next</button>`;
  });
}

function gapDetailInput(key,details,framework) {
  const value=details[key]||'',name=`gap-${key}`;
  const choices=key==='decisionNote'?gapDecisionOptions:key==='quarter'?['Q1','Q2','Q3','Q4']:key==='dimension'?['People','Process','Technology']:null;
  if(choices)return `<select name="${name}" ${key==='decisionNote'?'required':''}><option value="" ${!choices.includes(value)?'selected':''} ${key==='decisionNote'?'disabled':''}>${key==='decisionNote'?'Pilih Decision...':'Belum ditentukan'}</option>${choices.map(option=>`<option value="${option}" ${value===option?'selected':''}>${option}</option>`).join('')}</select>`;
  if(key==='gapNumber')return `<select name="gapNumberMode" aria-label="Mode nomor gap"><option value="auto" ${details.gapNumberMode==='auto'||!details.gapNumber?'selected':''}>Otomatis</option><option value="manual" ${details.gapNumberMode!=='auto'&&details.gapNumber?'selected':''}>Manual</option></select><input name="gap-gapNumber" type="text" maxlength="120" value="${escapeHtml(value)}" aria-label="Gap Number"><small>Nomor otomatis ditetapkan saat disimpan.</small>`;
  if(key==='yearOfInitiative')return `<input name="${name}" type="number" min="1000" max="9999" step="1" placeholder="Contoh: ${new Date().getFullYear()}" value="${escapeHtml(value)}" aria-label="Year of Initiative (tahun empat digit)">`;
  if(['domain','sub','gapNumber','client','pic'].includes(key))return `<input name="${name}" type="text" maxlength="4000" value="${escapeHtml(value)}" ${framework==='csf'&&['domain','sub'].includes(key)?'readonly aria-readonly="true"':''}>`;
  return `<textarea name="${name}" maxlength="4000" rows="2" ${framework==='csf'&&['domain','sub'].includes(key)?'readonly aria-readonly="true"':''}>${escapeHtml(value)}</textarea>`;
}

/** Render mode tambah/edit/monitor sesuai konteks; saat edit hanya form gap terpilih yang ditampilkan. */
function renderGapDialog() {
  if(!gapContext)return;
  const {frameworks,code,filter,editing}=gapContext;
  const rows=frameworks.flatMap(gapRows).filter(row=>(!code||row.controlCode===code)&&(filter==='all'||row.status===filter||filter==='missing'&&!row.evidence.length));
  const pages=Math.max(1,Math.ceil(rows.length/8));gapPage=Math.min(Math.max(gapPage,1),pages);
  const errors=frameworks.map(key=>assessmentGapState.get(key)?.error).filter(Boolean);
  $('gapDialogMessage').textContent=errors.join(' ') || `${rows.length} gap${code?' pada item ini':''}`;
  const editable=code && frameworks.length===1 && canPerform(gapPermissions[frameworks[0]],'update');
  const editRow=editing?rows.find(row=>row.id===editing):null;
  const formDetails=gapLinkedDetails(frameworks[0],code,editRow?.details);
  const cards=(editing?gapContext.editOnly&&!editable?rows.filter(row=>row.id===editing):[]:rows.slice((gapPage-1)*8,gapPage*8)).map(row=>`<article class="gap-record"><div class="gap-record-top"><strong>${escapeHtml(row.controlCode)}</strong><span class="gap-status ${row.status==='Closed'?'closed':'open'}">${row.status}</span></div><p class="gap-description">${escapeHtml(row.description)}</p>${gapDetailsHtml(row)}<div class="gap-evidence">${row.evidence.length?row.evidence.map(file=>`<a href="/api/files/${file.path.replace(/^uploads?\//,'').split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">${escapeHtml(file.name)}</a>`).join(''):'<span class="muted">Evidence belum diunggah</span>'}</div><small class="muted">Diperbarui oleh ${escapeHtml(row.updatedBy||row.createdBy||'—')} · ${(globalThis.NistI18n?.dateHtml?.(row.updatedAt, {year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}) ?? escapeHtml(new Date(row.updatedAt).toLocaleString(globalThis.NistI18n?.locale || 'id-ID', {year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'})))}</small><div class="gap-record-actions">${canPerform(gapPermissions[row.framework],'update')?`<button type="button" class="attachment-action-button" data-gap-edit="${row.id}" data-gap-framework="${row.framework}" data-gap-control="${escapeHtml(row.controlCode)}">Edit gap</button>`:''}${canPerform(gapPermissions[row.framework],'delete')?`<button type="button" class="attachment-action-button danger" data-gap-delete="${row.id}" data-gap-framework="${row.framework}" data-gap-control="${escapeHtml(row.controlCode)}">Hapus gap</button>`:''}</div></article>`).join('');
  $('gapDialogContent').innerHTML=`${editable?`<form id="assessmentGapForm" class="gap-form"><h4>${editRow?'Edit gap':'Tambah gap'}</h4><div class="gap-fields">${gapDetailFields.map(([key,label])=>`<label class="gap-field gap-field-${key}">${escapeHtml(label)}${gapDetailInput(key,formDetails,frameworks[0])}</label>`).join('')}</div><label>Gap<textarea name="description" required maxlength="4000" rows="3" placeholder="Contoh: kurang poin a">${escapeHtml(editRow?.description||'')}</textarea></label><label class="gap-status-field">Status<select name="status"><option value="Open" ${editRow?.status!=='Closed'?'selected':''}>Open</option><option value="Closed" ${editRow?.status==='Closed'?'selected':''}>Closed</option></select></label><div id="gapDraftEvidence"></div>${canPerform('files','read')?'<label>Cari evidence<input id="gapEvidenceSearch" type="search" placeholder="Cari nama file, asal upload, atau konten terkait..." aria-label="Cari evidence untuk gap" autocomplete="off"></label><label>Pilih evidence yang sudah diunggah<select id="gapEvidenceSelect"><option value="">Pilih file...</option></select></label><small id="gapEvidenceSearchStatus" role="status" aria-live="polite"></small>':''}${canPerform('files','create')?'<label>Upload evidence<input name="files" type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp"></label>':''}<p class="muted">Evidence dapat ditambahkan nanti. Setiap gap memiliki evidence sendiri.</p><div class="gap-form-actions"><button class="button button-accent" type="submit">${editRow?'Simpan gap':'+ Tambah gap'}</button>${editRow?'<button type="button" class="button button-quiet" data-gap-cancel-edit>Batal edit</button>':''}</div></form>`:''}${editing&&editable?'':`<div class="gap-records">${cards||'<p class="muted">Belum ada gap yang sesuai.</p>'}</div><div class="list-pagination"><button type="button" data-gap-page="${gapPage-1}" ${gapPage===1?'disabled':''}>Previous</button><span>${gapPage} / ${pages} · ${rows.length} gap</span><button type="button" data-gap-page="${gapPage+1}" ${gapPage===pages?'disabled':''}>Next</button></div>`}`;
  if(editable) {
    gapContext.draftEvidence=[...(editRow?.evidence||[])];gapContext.editingRow=editRow;
    renderGapDraftEvidence();void populateGapEvidence();
    $('assessmentGapForm').addEventListener('submit',saveAssessmentGap);
    $('assessmentGapForm').addEventListener('change',updateGapNumberPreview);
    $('assessmentGapForm').addEventListener('input',event=>{if(event.target.name==='gap-sub')updateGapNumberPreview();});
    updateGapNumberPreview();
  }
}

function renderGapDraftEvidence() {
  if(!$('gapDraftEvidence'))return;
  $('gapDraftEvidence').innerHTML=(gapContext.draftEvidence||[]).map((file,index)=>`<div class="gap-draft-file"><span>${escapeHtml(file.name)}</span><button type="button" class="attachment-action-button" data-gap-unlink="${index}" aria-label="Lepaskan ${escapeHtml(file.name)}">Lepaskan</button></div>`).join('');
}
