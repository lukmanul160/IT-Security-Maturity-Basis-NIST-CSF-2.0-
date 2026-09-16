function editUploadedFile(recordId) {
  const record = uploadedFileRecordMap.get(recordId);
  if (!record) return;
  if (record.sourceType === 'policy-register') {
    const row = policyRegisterRows.find(item => String(item.id) === String(record.policyId));
    if (row) openPolicyRegisterModal(row);
    else $('saveState').textContent = 'Kebijakan tidak ditemukan. Muat ulang daftar file lalu coba kembali.';
    return;
  }
  const extension = (String(record.name || '').match(/\.[^.]+$/)?.[0] || '').toLowerCase();
  $('uploadedFileEditForm').reset();
  $('uploadedFileEditRecordId').value = recordId;
  $('uploadedFileEditTitle').textContent = `Ganti ${record.name}`;
  $('uploadedFileEditSource').textContent = uploadedFileSourceLabel(record);
  $('uploadedFileEditCurrentName').textContent = record.name || '-';
  $('uploadedFileEditCurrentPath').textContent = record.path || '-';
  $('uploadedFileEditLocation').textContent = `${record.item.fn.name} · ${categoryLabel(record.item.category || 'CSF Core')}`;
  $('uploadedFileEditControl').textContent = `${record.item.fn.id} · ${record.item.name || record.item.subcategory || '-'}`;
  $('uploadedFileEditInput').accept = extension || '.pdf,.doc,.docx,.ppt,.pptx';
  $('uploadedFileEditHint').textContent = extension ? `Pilih file ${extension.toUpperCase()} agar path dan seluruh referensi tetap sama.` : 'Pilih file dengan format yang sama.';
  $('uploadedFileEditStatus').textContent = 'Ready';
  $('uploadedFileEditSubmit').disabled = false;
  $('uploadedFileEditModal')._record = record;
  $('uploadedFileEditModal').showModal();
}
function openUploadedFileSource() {
  const record = $('uploadedFileEditModal')._record;
  if (!record) return;
  $('uploadedFileEditModal').close();
  if (record.sourceType === 'iso27001' || record.sourceType === 'iso27001-soa') {
    const { id, isSoa } = isoRecordContext(record.key);
    isSoa ? openIso27001SoaManager(id) : openIso27001Manager(id);
    return;
  }
  const controlId = record.sourceType === 'privacy' ? record.key.split('-').slice(2).join('-') : record.key.split('-').slice(1).join('-');
  if (record.sourceType === 'privacy') {
    showPrivacyAssessment(record.item.fn.name);
    $('privacyAssessmentSearch').value = controlId;
    renderPrivacyAssessment(record.item.fn.name);
  } else {
    showAssessment(record.item.fn.id);
    $('searchInput').value = controlId;
    renderControls();
  }
}
async function replaceUploadedFile(event) {
  event.preventDefault();
  const record = $('uploadedFileEditModal')._record;
  const replacement = $('uploadedFileEditInput').files?.[0];
  if (!record || !replacement) return;
  const currentExtension = String(record.name || '').match(/\.[^.]+$/)?.[0]?.toLowerCase();
  const replacementExtension = String(replacement.name || '').match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if (!currentExtension || currentExtension !== replacementExtension) {
    $('uploadedFileEditStatus').textContent = `Format harus tetap ${currentExtension?.toUpperCase() || 'sama'}`;
    return;
  }

  const button = $('uploadedFileEditSubmit');
  button.disabled = true;
  $('uploadedFileEditStatus').textContent = 'Mengunggah file pengganti...';
  try {
    const formData = new FormData();
    formData.append('file', replacement, replacement.name);
    const response = await fetch(apiFileUrl(record.path), { method: 'PUT', body: formData });
    const metadata = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(metadata.error || 'File gagal diganti');
    metadata.name = record.name;

    if (record.key.startsWith('iso|')) {
      const { id, isSoa, row } = isoRecordContext(record.key);
      if (!row) throw new Error('Kontrol asal tidak ditemukan');
      const evidence = [...(row.evidence || [])];
      evidence[record.index] = metadata;
      const evidenceResponse = await updateIsoEvidence(isSoa ? 'soa' : 'clauses', id, evidence);
      if (!evidenceResponse.ok) throw new Error('Referensi ISO gagal diperbarui');
      row.evidence = evidence;
      isSoa ? renderIso27001SoaManager() : renderIso27001Manager();
    } else {
      const owner = attachmentStateFor(record.key);
      const attachments = [...(owner.attachments[record.key] || [])];
      attachments[record.index] = metadata;
      owner.attachments[record.key] = attachments;
      const stateResponse = await fetch(record.sourceType === 'privacy' ? '/api/privacy/assessment' : '/api/assessment', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(owner) });
      if (!stateResponse.ok) throw new Error('Referensi assessment gagal diperbarui');
      record.sourceType === 'privacy' ? renderPrivacy() : (renderCsfTable(), renderControls());
    }

    $('saveState').textContent = 'File berhasil diganti';
    renderUploadedFiles();
    $('uploadedFileEditModal').close();
  } catch (error) {
    $('uploadedFileEditStatus').textContent = error.message || 'File gagal diganti';
  } finally {
    button.disabled = false;
  }
}
