async function fileBackupRequest(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'File backup gagal diproses');
  return data;
}
async function loadFileBackups() {
  const rows = await fileBackupRequest('/api/file-backups');
  $('fileBackupCount').textContent = `${rows.length} backups`;
  $('fileBackupBody').innerHTML = rows.map(row => `<tr><td><strong>${escapeHtml(row.fileName)}</strong>${row.partCount ? `<br><span class="muted">Bagian ${row.part} / ${row.partCount} ? pilih semua bagian saat restore</span>` : ""}</td><td>${escapeHtml(new Date(row.createdAt).toLocaleString('id-ID'))}</td><td>${formatBackupSize(row.size)}</td><td><div class="backup-row-actions"><a class="attachment-action-button" href="/api/file-backups/${encodeURIComponent(row.fileName)}">Download</a><button class="attachment-action-button danger" type="button" data-file-backup-delete="${escapeHtml(row.fileName)}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="4">Belum ada file backup.</td></tr>';
}
async function loadFileBackupFolders() {
  const folders = await fileBackupRequest('/api/file-backups/folders');
  const current = $('fileBackupFolder').value;
  const options = folders.map(folder => `<option value="${escapeHtml(folder)}">${escapeHtml(folder)}</option>`).join('');
  $('fileBackupFolder').innerHTML = '<option value="">Semua folder</option>' + options;
  if (folders.includes(current)) $('fileBackupFolder').value = current;
  $('fileBackupFolderOptions').innerHTML = options;
}
async function createFileBackup() {
  const button = $('fileBackupCreateButton');
  button.disabled = true;
  $('fileBackupRestoreButton').disabled = true;
  $('fileBackupRestoreInput').disabled = true;
  window.NistUploadProgress.setProgress('fileBackup', { label: 'Membuat arsip file di server...', detail: 'Membaca file dan membuat seluruh bagian ZIP. Persentase pemrosesan server belum tersedia.' });
  const folder = $('fileBackupFolder').value;
  $('fileBackupStatus').textContent = folder ? `Membuat backup folder ${folder}...` : 'Membuat backup seluruh file unggahan...';
  try {
    const data = await fileBackupRequest('/api/file-backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder }) });
    $('fileBackupStatus').textContent = `Backup berhasil: ${data.fileCount} file, ${data.parts?.length || 1} bagian ZIP. Unduh semua bagian dari batch yang sama untuk restore.`;
    if (data.missingFiles?.length) $('fileBackupStatus').textContent = `Backup belum lengkap: ${data.fileCount} file tersedia telah dicadangkan (${data.parts?.length || 1} ZIP), tetapi ${data.missingFiles.length} file tidak ditemukan. Daftar file yang perlu diunggah ulang tercantum dalam manifest ZIP: ${data.missingFiles.map(file => file.path).join('; ')}`;
    window.NistUploadProgress.setProgress('fileBackup', { phase: 'success', label: data.missingFiles?.length ? 'Backup selesai dengan catatan' : 'Backup file selesai', percent: 100, detail: `${data.fileCount} file · ${data.parts?.length || 1} ZIP${data.missingFiles?.length ? ` · ${data.missingFiles.length} file tidak ditemukan` : ''}` });
    await loadFileBackups().catch(error => { $('fileBackupStatus').textContent += ` Daftar backup belum diperbarui: ${error.message}`; });
  } catch (error) { $('fileBackupStatus').textContent = error.message; window.NistUploadProgress.setProgress('fileBackup', { phase: 'error', label: 'Backup gagal', detail: error.message }); }
  finally { button.disabled = false; $('fileBackupRestoreInput').disabled = false; $('fileBackupRestoreButton').disabled = !selectedFileBackupRestore.length; }
}
async function deleteFileBackup(fileName) {
  if (!confirm(`Hapus file backup ${fileName}?`)) return;
  await fileBackupRequest(`/api/file-backups/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
  $('fileBackupStatus').textContent = `Backup dihapus: ${fileName}`;
  await loadFileBackups();
}
function showFileBackupsView() {
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view'));
  $('fileBackupsView').classList.add('active-view');
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'file-backups'));
  saveUiState('file-backups');
  loadFileBackups().catch(error => { $('fileBackupStatus').textContent = error.message; });
  loadFileBackupFolders().catch(error => { $('fileBackupStatus').textContent = error.message; });
}
document.querySelector('[data-view="file-backups"]').addEventListener('click', showFileBackupsView);
$('fileBackupCreateButton').addEventListener('click', createFileBackup);
$('fileBackupBody').addEventListener('click', event => {
  const button = event.target.closest('[data-file-backup-delete]');
  if (button) deleteFileBackup(button.dataset.fileBackupDelete).catch(error => { $('fileBackupStatus').textContent = error.message; });
});
if (uiState.view === 'file-backups') showFileBackupsView();
let selectedFileBackupRestore = [];
$('fileBackupRestoreInput').addEventListener('change', event => {
  selectedFileBackupRestore = Array.from(event.target.files || []);
  if (selectedFileBackupRestore.some(file => file.size > 500 * 1024 * 1024 || !/\.zip$/i.test(file.name))) {
    selectedFileBackupRestore = [];
    event.target.value = '';
    $('fileBackupStatus').textContent = 'Pilih bagian ZIP maksimal 500 MB per bagian. Ukuran total batch tidak dibatasi.';
  }
  $('fileBackupRestoreFileName').textContent = selectedFileBackupRestore.length ? `${selectedFileBackupRestore.length} ZIP · ${formatBackupSize(selectedFileBackupRestore.reduce((sum, file) => sum + file.size, 0))}` : 'No file selected';
  $('fileBackupRestoreFileName').title = selectedFileBackupRestore.map(file => file.name).join('\n');
  window.NistUploadProgress.showFiles('fileBackup', selectedFileBackupRestore);
  $('fileBackupProgressPanel').hidden = true;
  $('fileBackupRestoreButton').disabled = !selectedFileBackupRestore.length;
});
$('fileBackupRestoreButton').addEventListener('click', async () => {
  if (!selectedFileBackupRestore.length || !confirm('Restore akan mengganti file dengan path yang sama dan memulihkan metadata unggahan. Lanjutkan?')) return;
  const button = $('fileBackupRestoreButton');
  button.disabled = true;
  $('fileBackupRestoreInput').disabled = true;
  $('fileBackupCreateButton').disabled = true;
  $('fileBackupStatus').textContent = 'Memvalidasi dan memulihkan file backup...';
  try {
    const body = new FormData();
    selectedFileBackupRestore.forEach(file => body.append('backups', file));
    body.append('folder', $('fileBackupRestoreFolder').value.trim());
    const result = await fileBackupRequest('/api/file-backups/restore-batch', { method: 'POST', body, uploadProgressTarget: 'fileBackup' });
    $('fileBackupStatus').textContent = `Restore berhasil: ${result.fileCount} file dipulihkan.`;
    if (result.missingFiles?.length) $('fileBackupStatus').textContent += ` Perhatian: backup asal tidak lengkap; ${result.missingFiles.length} file tidak tersedia saat backup dibuat dan perlu diunggah ulang.`;
    window.NistUploadProgress.showFiles('fileBackup', selectedFileBackupRestore, 'Dipulihkan');
    window.NistUploadProgress.setProgress('fileBackup', { phase: 'success', label: 'Batch restore selesai', percent: 100, detail: `${result.fileCount} file dipulihkan dari ${selectedFileBackupRestore.length} ZIP.` });
    selectedFileBackupRestore = [];
    $('fileBackupRestoreInput').value = '';
    $('fileBackupRestoreFileName').textContent = 'No file selected';
    try { await refreshEvidenceLibrary(); await loadFileBackupFolders(); } catch (error) { $('fileBackupStatus').textContent += ` Muat ulang daftar file: ${error.message}`; }
  } catch (error) { $('fileBackupStatus').textContent = error.message; window.NistUploadProgress.setProgress('fileBackup', { phase: 'error', label: 'Batch restore gagal', detail: error.message }); }
  finally {
    button.disabled = !selectedFileBackupRestore.length;
    $('fileBackupRestoreInput').disabled = false;
    $('fileBackupCreateButton').disabled = false;
  }
});
