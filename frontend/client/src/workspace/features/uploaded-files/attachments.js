function attachmentRecords() {
  const csfRecords = Object.entries(state.attachments || {}).flatMap(([key, attachments]) => {
    const separator = key.indexOf('-'); const kind = key.slice(0, separator); const controlId = key.slice(separator + 1); const item = allControls().find(control => control.id === controlId);
    if (!item || !Array.isArray(attachments)) return [];
    return attachments.map((attachment, index) => ({ ...attachment, key, index, kind, item, sourceType: 'csf' }));
  });
  const privacyRecords = Object.entries(privacyState.attachments || {}).flatMap(([key, attachments]) => {
    if (!key.startsWith('privacy-') || !Array.isArray(attachments)) return [];
    const parts = key.split('-'); const kind = parts[1]; const controlId = parts.slice(2).join('-'); const source = privacyRows.find(row => row.id === controlId); if (!source) return [];
    const item = { ...source, name: source.subcategory.split(':').slice(1).join(':').trim(), fn: { id: source.function.match(/\(([A-Z]+-P)\)/)?.[1] || source.function, name: source.function.split(' (', 1)[0] } };
    return attachments.map((attachment, index) => ({ ...attachment, key, index, kind, item, sourceType: 'privacy' }));
  });
  const isoRecords = [
    ...iso27001Rows.flatMap(item => (Array.isArray(item.evidence) ? item.evidence : []).map((attachment, index) => ({ ...attachment, key: `iso|iso27001|${item.id}`, index, kind: 'policy', sourceType: 'iso27001', item: { ...item, frameworkLabel: 'ISO 27001:2022', name: item.subcategory, fn: { id: item.id, name: item.function } } }))),
    ...iso27001SoaRows.flatMap(item => (Array.isArray(item.evidence) ? item.evidence : []).map((attachment, index) => ({ ...attachment, key: `iso|iso27001-soa|${item.id}`, index, kind: 'policy', sourceType: 'iso27001-soa', item: { ...item, frameworkLabel: 'SOA (Statement of Applicability)', name: item.subcategory, fn: { id: item.id, name: item.function } } }))),
  ];
  const policyRecords = policyRegisterFiles().map(file => ({ ...file, key: 'policy-register', index: file.sourceIndex, kind: 'policy', sourceType: 'policy-register', item: { name: file.name, category: 'Policy Register', subcategory: file.name, frameworkLabel: 'Policy Register', fn: { id: 'POLICY', name: 'Policy Register' } } }));
  return [...csfRecords, ...privacyRecords, ...isoRecords, ...policyRecords].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}
// Library membership is supplied by the server: non-admins receive only their own uploads.
const canEditUploadedFile = record => Boolean(record?.path && selectableEvidenceRecords().some(file => file.path === record.path));
function uploadedLibraryRecords() {
  const references = new Map(attachmentRecords().map(record => [record.path, record]));
  return selectableEvidenceRecords().map((file, index) => {
    const reference = references.get(file.path);
    const folder = file.path.replace(/^uploads?\//, '').split('/')[0];
    const record = { ...(reference || { key: 'uploaded-library', index, sourceType: 'uploaded-library', item: { frameworkLabel: file.module || file.source || 'Uploaded files', name: file.module || file.source || 'Uploaded files', category: '-', fn: { id: '-', name: folder } } }), ...file };
    // Origin describes the original upload, even when another module reuses the file.
    return {...record, uploadSource:uploadedFileOrigin(file), format:uploadedFileFormat(file), kind:file.path.includes('/Practice/')?'practice':file.path.includes('/Policy/')?'policy':'other'};
  });
}
function uploadedFileOrigin(file) {
  const folder=String(file.path || '').replace(/^uploads?\//,'').split('/')[0];
  const source=file.source || file.module || folder || 'Uploaded files';
  if(['Govern','Identify','Protect','Detect','Respond','Recover'].includes(source))return `CSF 2.0 / ${source}`;
  if(/^[A-Z]+-P$/.test(source))return `Privacy Framework / ${source}`;
  return ({'ISO 27001':'ISO 27001:2022','ISO 27001 SOA':'ISO 27001 / SOA','policy-register':'Policy Register','audit-finding':'Audit Finding Tracker','Audit Finding':'Audit Finding Tracker'})[source] || source;
}
function uploadedFileFormat(file) {
  const extension=String(file.name || file.path || '').match(/\.([a-z0-9]+)$/i)?.[1]?.toUpperCase();
  return extension || ({'application/pdf':'PDF','image/png':'PNG','image/jpeg':'JPG','image/webp':'WEBP','image/gif':'GIF'})[file.type] || 'Tanpa ekstensi';
}
function syncUploadedFileFilter(id,records,field,label,display=value=>value) {
  const select=$(id);if(!select)return;
  const previous=select.value,counts=new Map();
  records.forEach(record=>counts.set(record[field],(counts.get(record[field])||0)+1));
  select.innerHTML=`<option value="all">${escapeHtml(label)}</option>`+[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([value,count])=>`<option value="${escapeHtml(value)}">${escapeHtml(display(value))} (${count})</option>`).join('');
  select.value=counts.has(previous)?previous:'all';
  if(select.value!==previous)uploadedFilesPage=1;
}
async function deleteUploadedLibraryFile(recordId) {
  const record = uploadedFileRecordMap.get(recordId);
  if (!canEditUploadedFile(record) || !confirm(`File ini adalah file asli/induk: ${record.name}. Menghapusnya akan menghapus file secara permanen dan seluruh referensinya di assessment, policy, TPRM, audit, aset/rak, dan Knowledge. Lanjutkan?`)) return;
  const status = message => { $('uploadedFilesStatus').textContent = message; $('saveState').textContent = message; };
  status(`Menghapus file ${record.name}...`);
  try {
    const response = await fetch(`${apiFileUrl(record.path)}?library=true`, { method: 'DELETE' });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'File gagal dihapus.');
    const matches = file => String(file?.path || '').replace(/^uploads?\//, '') === record.path.replace(/^uploads?\//, '');
    for (const owner of [state, privacyState]) for (const [key, files] of Object.entries(owner.attachments || {})) {
      if (Array.isArray(files)) owner.attachments[key] = files.filter(file => !matches(file));
    }
    for (const row of [...iso27001Rows, ...iso27001SoaRows]) if (Array.isArray(row.evidence)) row.evidence = row.evidence.filter(file => !matches(file));
    for (const row of policyRegisterRows) if (matches({path:row.attachmentPath})) { row.attachmentPath=''; row.attachmentName=''; row.attachmentType=''; }
    evidenceLibrary=evidenceLibrary.filter(file=>!matches(file));
    if(typeof questionnaireRows!=='undefined') for(const row of questionnaireRows) if(Array.isArray(row.responses?.vendorDocuments)) row.responses.vendorDocuments=row.responses.vendorDocuments.filter(file=>!matches(file));
    if(typeof renderPolicyRegisterRows==='function') renderPolicyRegisterRows();
    if(typeof renderCsfTable==='function') renderCsfTable();
    if(typeof renderPrivacy==='function') renderPrivacy();
    if(typeof renderControls==='function') renderControls();
    if(typeof renderIso27001Manager==='function') renderIso27001Manager();
    if(typeof renderIso27001SoaManager==='function') renderIso27001SoaManager();
    if(typeof renderQuestionnaires==='function') renderQuestionnaires();
    if(typeof window!=='undefined') window.dispatchEvent(new CustomEvent('evidence-file-deleted',{detail:{path:record.path}}));
    const currentPolicy=policyRegisterRows.find(row=>String(row.id)===String($('policyRegisterId')?.value));
    if(currentPolicy && !currentPolicy.attachmentPath) { $('policyRegisterFilePreview').hidden=true; $('policyRegisterFileName').textContent='-'; }
    await refreshEvidenceLibrary({force:true});
    status('File asli dan seluruh referensinya berhasil dihapus.'+(evidenceLibraryError ? ' '+evidenceLibraryError : ''));

  } catch (error) { status(error.message); }
}
function renderUploadedFiles() {
  const allRecords = uploadedLibraryRecords();
  syncUploadedFileFilter('uploadedFileSourceFilter',allRecords,'uploadSource','Semua asal upload');
  syncUploadedFileFilter('uploadedFileKindFilter',allRecords,'kind','Semua evidence',value=>({policy:'Policy',practice:'Practice',other:'Lainnya'})[value]);
  syncUploadedFileFilter('uploadedFileFormatFilter',allRecords,'format','Semua format');
  const query=$('uploadedFileSearch').value.trim().toLowerCase(),kindFilter=$('uploadedFileKindFilter').value,sourceFilter=$('uploadedFileSourceFilter').value,formatFilter=$('uploadedFileFormatFilter').value;
  const records = allRecords.filter(record => { const item = record.item; const text = `${record.name} ${record.path} ${record.uploadSource} ${record.format} ${item.fn.name} ${item.category} ${item.subcategory}`.toLowerCase(); return (kindFilter === 'all' || record.kind === kindFilter) && (sourceFilter==='all'||record.uploadSource===sourceFilter) && (formatFilter==='all'||record.format===formatFilter) && text.includes(query); });
  uploadedFileRecordMap = new Map(allRecords.map((record, index) => [`uploaded-${index}`, record]));
  const recordIds = new Map([...uploadedFileRecordMap].map(([id, record]) => [record, id]));
  const total = allRecords.length; $('uploadedFileCount').textContent = `${records.length} dari ${total} file${evidenceLibraryError ? ' (daftar belum diperbarui)' : ''}`;
  uploadedFilesPage = renderListPagination('uploadedFilesPagination', uploadedFilesPage, records.length, 'files'); const visibleRecords = records.slice((uploadedFilesPage - 1) * 20, uploadedFilesPage * 20);
  $('uploadedFilesBody').innerHTML = visibleRecords.map(record => `<tr><td><strong class="uploaded-file-name" title="${escapeHtml(record.path)}">${escapeHtml(record.name)}</strong><small>File asli/induk</small><small>${escapeHtml(record.path)}</small></td><td><span class="framework-badge">${escapeHtml(record.uploadSource)}</span></td><td><span class="function-badge">${escapeHtml(record.item.fn.id)}</span>${escapeHtml(record.item.fn.name)}</td><td>${escapeHtml(categoryLabel(record.item.category || 'CSF Core'))}</td><td>${escapeHtml(record.item.name)}</td><td><span class="file-kind ${record.kind}">${record.kind === 'policy' ? 'Policy' : record.kind === 'practice' ? 'Practice' : 'Lainnya'}</span></td><td>${record.updatedAt ? new Date(record.updatedAt).toLocaleDateString('id-ID') : '-'}</td><td><div class="file-actions"><button class="attachment-action-button" type="button" data-open-library-file="${recordIds.get(record)}">Open</button><button class="attachment-action-button" type="button" data-download-library-file="${recordIds.get(record)}">Download</button>${canEditUploadedFile(record) ? `<button class="attachment-action-button" type="button" data-uploaded-file-edit="${recordIds.get(record)}">Edit</button>` : ''}${canEditUploadedFile(record) ? `<button class="attachment-action-button danger" type="button" data-delete-library-file="${recordIds.get(record)}">Hapus file asli</button>` : ''}</div></td></tr>`).join('') || `<tr><td colspan="8" class="empty-files">${evidenceLibraryError ? escapeHtml(evidenceLibraryError) : allRecords.length ? 'Tidak ada file yang sesuai filter.' : 'Belum ada file yang diupload.'}</td></tr>`;
  $('uploadedFilesBody').querySelectorAll('[data-delete-library-file]').forEach(button => button.addEventListener('click', () => deleteUploadedLibraryFile(button.dataset.deleteLibraryFile)));
  $('uploadedFilesBody').querySelectorAll('[data-open-library-file]').forEach(button => button.addEventListener('click', () => { const record = uploadedFileRecordMap.get(button.dataset.openLibraryFile); if (record) window.open(apiFileOpenUrl(record.path), '_blank', 'noopener'); }));
  $('uploadedFilesBody').querySelectorAll('[data-download-library-file]').forEach(button => button.addEventListener('click', () => { const record = uploadedFileRecordMap.get(button.dataset.downloadLibraryFile); if (!record) return; const link = document.createElement('a'); link.href = apiFileUrl(record.path); link.download = record.name; link.click(); }));
}
let evidenceSelectionSaving = false;
async function persistSelectedEvidence(targetKey, sourceAttachment, privacy = false) {
  if (!sourceAttachment || evidenceSelectionSaving) return;
  const owner = privacy ? privacyState : state;
  const attachments = owner.attachments[targetKey] || [];
  if (attachments.some(file => file.path === sourceAttachment.path)) return;
  const next = [...attachments, evidenceReference(sourceAttachment)];
  evidenceSelectionSaving = true;
  $('saveState').textContent = 'Saving evidence...';
  try {
    const response = await fetch(privacy ? '/api/privacy/assessment' : '/api/assessment', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...owner, attachments: { ...owner.attachments, [targetKey]: next } })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Evidence gagal disimpan.');
    }
    owner.attachments[targetKey] = next;
    if (privacy) {
      renderPrivacy();
      if ($('privacyAssessmentView').classList.contains('active-view')) renderPrivacyAssessment($('privacyAssessmentTitle').textContent);
    } else {
      renderCsfTable();
      if ($('assessmentView').classList.contains('active-view')) renderControls();
    }
    renderUploadedFiles(); $('saveState').textContent = 'Evidence tersimpan.';
  } catch (error) { $('saveState').textContent = error.message; }
  finally { evidenceSelectionSaving = false; }
}
async function useExistingAttachment(targetKey, sourceKey, sourceIndex) {
  const source = sourceKey === 'uploaded-library' ? selectableEvidenceRecords()[sourceIndex] : sourceKey === 'policy-register' ? policyRegisterFiles().find(file => file.sourceIndex === sourceIndex) : (attachmentStateFor(sourceKey).attachments[sourceKey] || [])[sourceIndex];
  await persistSelectedEvidence(targetKey, source);
}
async function useExistingPrivacyAttachment(targetKey, sourceKey, sourceIndex) {
  const source = sourceKey === 'uploaded-library' ? selectableEvidenceRecords()[sourceIndex] : sourceKey === 'policy-register' ? policyRegisterFiles().find(file => file.sourceIndex === sourceIndex) : (privacyState.attachments[sourceKey] || [])[sourceIndex];
  await persistSelectedEvidence(targetKey, source, true);
}
async function ensureUploadStructure() { for (const fn of functions) { const functionDirectory = await uploadDirectoryHandle.getDirectoryHandle(fn.name, { create: true }); await functionDirectory.getDirectoryHandle('Policy', { create: true }); await functionDirectory.getDirectoryHandle('Practice', { create: true }); } }
const updateUploadProgress = (key, percent, message, status = '') => { uploadStatuses.set(key, { percent, message, status }); document.querySelectorAll(`[data-progress-key="${key}"]`).forEach(progress => { progress.className = `upload-progress ${status}`; progress.querySelector('.upload-progress-track i').style.width = `${percent}%`; progress.querySelector('small').textContent = message; }); };
async function uploadAttachment(input) {
  const files = [...input.files]; if (!files.length) return;
  const key = input.dataset.attachment;
  const isPrivacy = input.dataset.scope === 'privacy';
  if (isPrivacy) await privacyDataReady;
  const owner = attachmentStateFor(key);
  try {
    updateUploadProgress(key, 2, `Uploading ${files.length} file(s)...`);
    const metadataList = await saveFilesToServer(input.dataset.function, input.dataset.kind, files);
    const attachments = [...(owner.attachments[key] || [])];
    metadataList.forEach(metadata => {
      const existing = attachments.findIndex(attachment => attachment.path === metadata.path);
      if (existing >= 0) attachments[existing] = metadata; else attachments.push(metadata);
    });
    const response = await fetch(isPrivacy ? '/api/privacy/assessment' : '/api/assessment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...owner, attachments: { ...owner.attachments, [key]: attachments } }) });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'File tersimpan di Uploaded Files, tetapi lampiran belum berhasil dikaitkan.');
    owner.attachments[key] = attachments;
    updateUploadProgress(key, 100, `${files.length} file(s) uploaded`, 'success');
    $('saveState').textContent = 'File dan lampiran berhasil disimpan.';
  } catch (error) {
    updateUploadProgress(key, 100, error.message || 'Upload failed', 'fail');
    $('saveState').textContent = error.message || 'Upload gagal';
  }
  renderCsfTable(); renderUploadedFiles();
  if ($('assessmentView').classList.contains('active-view')) renderControls();
  if ($('privacyView').classList.contains('active-view')) renderPrivacy();
  input.value = '';
}
async function replaceAttachment(input) {
  const key = input.dataset.replaceAttachment;
  const index = Number(input.dataset.attachmentIndex);
  const attachment = (attachmentStateFor(key).attachments[key] || [])[index];
  const file = input.files?.[0];
  if (!attachment || !file) return;
  try {
    const data = new FormData(); data.append('file', file, file.name);
    const response = await fetch(apiFileUrl(attachment.path), { method: 'PUT', body: data });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'File gagal diganti.');
    Object.assign(attachment, result);
    await refreshEvidenceLibrary();
    $('saveState').textContent = 'File berhasil diganti.';
  } catch (error) { $('saveState').textContent = error.message; }
  input.value = '';
}

const apiFileUrl = filePath => `/api/files/${filePath.replace(/^upload\//, '').split('/').map(encodeURIComponent).join('/')}`;
const apiFileOpenUrl = filePath => `/api/files/open/${filePath.replace(/^upload\//, '').split('/').map(encodeURIComponent).join('/')}`;
async function saveFilesToServer(functionName, kind, files) { const formData = new FormData(); formData.append('functionName', functionName); formData.append('kind', kind); formData.append('rejectDuplicate', 'true'); files.forEach(file => formData.append('files', file, file.name)); const response = await fetch('/api/files/batch', { method: 'POST', body: formData }); if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Upload failed'); } const uploaded = await response.json(); await refreshEvidenceLibrary(); return uploaded; }
function isoRecordContext(key) { const [, framework, ...idParts] = String(key).split('|'); const id = idParts.length ? idParts.join('|') : framework; const isSoa = idParts.length ? framework === 'iso27001-soa' : iso27001SoaRows.some(row => row.id === id); const rows = isSoa ? iso27001SoaRows : iso27001Rows; return { id, isSoa, rows, row: rows.find(item => item.id === id) }; }
function isoAttachmentFor(key, index) { return isoRecordContext(key).row?.evidence?.[index]; }
async function openAttachment(key, index) { const attachment = key === 'policy-register' ? policyRegisterFiles().find(file => file.sourceIndex === index) : key.startsWith('iso|') ? isoAttachmentFor(key, index) : (attachmentStateFor(key).attachments[key] || [])[index]; if (attachment) window.open(apiFileOpenUrl(attachment.path), '_blank', 'noopener'); }
async function downloadAttachment(key, index) { const attachment = key === 'policy-register' ? policyRegisterFiles().find(file => file.sourceIndex === index) : key.startsWith('iso|') ? isoAttachmentFor(key, index) : (attachmentStateFor(key).attachments[key] || [])[index]; if (attachment) { const link = document.createElement('a'); link.href = apiFileUrl(attachment.path); link.download = attachment.name; link.click(); } }
async function deleteAttachment(key, index) { if (key === 'policy-register') { const policyId = document.querySelector(`#uploadedFilesBody [data-delete-attachment="policy-register"][data-attachment-index="${index}"]`)?.dataset.policyId; const row = policyRegisterRows.find(item => String(item.id) === String(policyId)) || policyRegisterRows[index]; if (!row || !confirm(`Lepaskan referensi file ${row.attachmentName}? File asli/induk dan referensi di lokasi lain tetap tersedia.`)) return; const response = await fetch(`/api/policy-register/${encodeURIComponent(row.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...row, removeAttachment: true }) }); if (response.ok) await loadPolicyRegisterRows(); else $('saveState').textContent = 'Referensi file Policy Register gagal dilepas'; return; } if (key.startsWith('iso|')) { const { id, isSoa, row } = isoRecordContext(key); if (!row) return; const attachments = [...(row.evidence || [])]; const attachment = attachments[index]; if (!attachment || !confirm(`Lepaskan referensi file ${attachment.name}? File asli/induk dan referensi di lokasi lain tetap tersedia.`)) return; attachments.splice(index, 1); if ((await updateIsoEvidence(isSoa ? 'soa' : 'clauses', id, attachments)).ok) { row.evidence = attachments; renderUploadedFiles(); isSoa ? renderIso27001SoaManager() : renderIso27001Manager(); } return; } const owner = attachmentStateFor(key); const attachments = owner.attachments[key] || []; const attachment = attachments[index];
  if (!attachment || !confirm(`Lepaskan referensi file ${attachment.name}? File asli/induk dan referensi di lokasi lain tetap tersedia.`)) return;
  try {
    const next = attachments.filter((_, position) => position !== index);
    const response = await fetch(key.startsWith('privacy-') ? '/api/privacy/assessment' : '/api/assessment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...owner, attachments: { ...owner.attachments, [key]: next } }) });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Lampiran gagal dilepas.');
    owner.attachments[key] = next;
    $('saveState').textContent = 'Referensi lampiran dilepas. File utama tetap tersedia di Uploaded files.';
    await refreshEvidenceLibrary(); renderCsfTable();
    if ($('privacyView').classList.contains('active-view')) renderPrivacy();
  } catch (error) { $('saveState').textContent = error.message; }
}
