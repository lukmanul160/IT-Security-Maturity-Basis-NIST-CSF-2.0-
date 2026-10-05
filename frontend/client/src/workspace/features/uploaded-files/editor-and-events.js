function editUploadedFile(recordId) {
  const record = uploadedFileRecordMap.get(recordId);
  if (!canEditUploadedFile(record)) return;
  $('uploadedFileEditSourceButton').hidden = ['uploaded-library', 'policy-register'].includes(record.sourceType);
  const extension = (String(record.name || '').match(/\.[^.]+$/)?.[0] || '').toLowerCase();
  $('uploadedFileEditForm').reset();
  $('uploadedFileEditRecordId').value = recordId;
  $('uploadedFileEditTitle').textContent = `Ganti ${record.name}`;
  $('uploadedFileEditSource').textContent = uploadedFileSourceLabel(record);
  $('uploadedFileEditCurrentName').textContent = record.name || '-';
  $('uploadedFileEditCurrentPath').textContent = record.path || '-';
  $('uploadedFileEditLocation').textContent = `${record.item.fn.name} Â· ${categoryLabel(record.item.category || 'CSF Core')}`;
  $('uploadedFileEditControl').textContent = `${record.item.fn.id} Â· ${record.item.name || record.item.subcategory || '-'}`;
  $('uploadedFileEditInput').accept = extension || '.pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp';
  const isPdf = extension === '.pdf' || record.type === 'application/pdf';
  $('uploadedPdfOpenPageField').hidden = !isPdf;
  $('uploadedPdfOpenPageSave').hidden = !isPdf;
  $('uploadedPdfOpenPage').value = Math.max(1, Number(record.openPage) || 1);
  $('uploadedFileEditHint').textContent = extension ? `Pilih file ${extension.toUpperCase()} agar path dan seluruh referensi tetap sama.` : 'Pilih file dengan format yang sama.';
  $('uploadedFileEditStatus').textContent = 'Ready';
  $('uploadedFileEditSubmit').disabled = false;
  $('uploadedFileEditModal')._record = record;
  $('uploadedFileEditModal').showModal();
}
async function saveUploadedPdfOpenPage() {
  const record = $('uploadedFileEditModal')._record;
  if (!canEditUploadedFile(record)) return;
  const openPage = Number($('uploadedPdfOpenPage').value);
  if (!Number.isInteger(openPage) || openPage < 1) { $('uploadedFileEditStatus').textContent = 'Masukkan nomor halaman PDF minimal 1.'; return; }
  const response = await fetch(`/api/files/open-page/${record.path.replace(/^upload\//, '').split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ openPage }) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) { $('uploadedFileEditStatus').textContent = result.error || 'Halaman PDF gagal disimpan.'; return; }
  record.openPage = result.openPage;
  $('uploadedFileEditStatus').textContent = `PDF akan dibuka pada halaman ${result.openPage}.`;
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
  if (!canEditUploadedFile(record) || !replacement) return;
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
    // The replacement keeps its path; existing references need no assessment write.
    await refreshEvidenceLibrary();
    $('saveState').textContent = 'File berhasil diganti';
    renderUploadedFiles();
    $('uploadedFileEditModal').close();
  } catch (error) {
    $('uploadedFileEditStatus').textContent = error.message || 'File gagal diganti';
  } finally {
    button.disabled = false;
  }
}


let uploadedFilesUploading = false;
async function uploadLibraryFiles(files) {
  if (uploadedFilesUploading || !files.length) return;
  const status = $('uploadedFilesStatus');
  if (!canPerform('files', 'create')) { status.textContent = 'Izin Add pada Uploaded files diperlukan.'; return; }
  if (files.length > 20) { status.textContent = 'Pilih maksimal 20 file sekali upload.'; return; }
  if (files.some(file => file.size > 50 * 1024 * 1024)) { status.textContent = 'Ukuran setiap file maksimal 50 MB.'; return; }
  const kind = $('uploadedFilesUploadKind').value;
  uploadedFilesUploading = true;
  $('uploadedFilesUploadButton').disabled = true;
  let uploaded = 0;
  try {
    for (const file of files) {
      status.textContent = `Mengunggah ${uploaded + 1}/${files.length}: ${file.name}`;
      const body = new FormData();
      body.append('functionName', 'Uploaded files'); body.append('kind', kind); body.append('file', file, file.name);
      const response = await fetch('/api/files', { method: 'POST', body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Upload gagal (HTTP ${response.status}).`);
      uploaded++;
      evidenceLibrary = [...evidenceLibrary.filter(item => item.path !== result.path), result];
    }
    $('uploadedFileSearch').value = ''; $('uploadedFileKindFilter').value = 'all';
    renderUploadedFiles();
    await refreshEvidenceLibrary({ force: true });
    status.textContent = `${uploaded} file berhasil diupload dan tersedia sebagai referensi.${evidenceLibraryError ? ' ' + evidenceLibraryError : ''}`;
  } catch (error) {
    renderUploadedFiles();
    status.textContent = `${uploaded}/${files.length} file berhasil diupload. ${error.message}`;
  } finally {
    uploadedFilesUploading = false;
    $('uploadedFilesUploadButton').disabled = !canPerform('files', 'create');
  }
}
$('uploadedFilesUploadButton').addEventListener('click', () => {
  if (!uploadedFilesUploading && canPerform('files', 'create')) $('uploadedFilesUploadInput').click();
});
$('uploadedFilesUploadInput').addEventListener('change', event => {
  const files = Array.from(event.target.files || []); event.target.value = ''; void uploadLibraryFiles(files);
});
