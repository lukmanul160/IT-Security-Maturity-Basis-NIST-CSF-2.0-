async function fileBackupRequest(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'File backup gagal diproses');
  return data;
}
async function loadFileBackups() {
  const rows = await fileBackupRequest('/api/file-backups');
  $('fileBackupCount').textContent = `${rows.length} backups`;
  $('fileBackupBody').innerHTML = rows.map(row => `<tr><td><strong>${escapeHtml(row.fileName)}</strong></td><td>${escapeHtml(new Date(row.createdAt).toLocaleString('id-ID'))}</td><td>${formatBackupSize(row.size)}</td><td><div class="backup-row-actions"><a class="attachment-action-button" href="/api/file-backups/${encodeURIComponent(row.fileName)}">Download</a><button class="attachment-action-button danger" type="button" data-file-backup-delete="${escapeHtml(row.fileName)}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="4">Belum ada file backup.</td></tr>';
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
  const folder = $('fileBackupFolder').value;
  $('fileBackupStatus').textContent = folder ? `Membuat backup folder ${folder}...` : 'Membuat backup seluruh file unggahan...';
  try {
    const data = await fileBackupRequest('/api/file-backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder }) });
    $('fileBackupStatus').textContent = `Backup berhasil dibuat: ${data.fileName} (${data.fileCount} file)`;
    await loadFileBackups();
  } catch (error) { $('fileBackupStatus').textContent = error.message; }
  finally { button.disabled = false; }
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
let selectedFileBackupRestore = null;
$('fileBackupRestoreInput').addEventListener('change', event => {
  selectedFileBackupRestore = event.target.files?.[0] || null;
  if (selectedFileBackupRestore?.size > 500 * 1024 * 1024) {
    selectedFileBackupRestore = null;
    event.target.value = '';
    $('fileBackupStatus').textContent = 'ZIP maksimal 500 MB. Gunakan backup per folder.';
  }
  $('fileBackupRestoreFileName').textContent = selectedFileBackupRestore?.name || 'No file selected';
  $('fileBackupRestoreButton').disabled = !selectedFileBackupRestore;
});
$('fileBackupRestoreButton').addEventListener('click', async () => {
  if (!selectedFileBackupRestore || !confirm('Restore akan mengganti file dengan path yang sama dan memulihkan metadata unggahan. Lanjutkan?')) return;
  const button = $('fileBackupRestoreButton');
  button.disabled = true;
  $('fileBackupRestoreInput').disabled = true;
  $('fileBackupCreateButton').disabled = true;
  $('fileBackupStatus').textContent = 'Memvalidasi dan memulihkan file backup...';
  try {
    const body = new FormData();
    body.append('backup', selectedFileBackupRestore);
    body.append('folder', $('fileBackupRestoreFolder').value.trim());
    const result = await fileBackupRequest('/api/file-backups/restore', { method: 'POST', body });
    $('fileBackupStatus').textContent = `Restore berhasil: ${result.fileCount} file dipulihkan.`;
    selectedFileBackupRestore = null;
    $('fileBackupRestoreInput').value = '';
    $('fileBackupRestoreFileName').textContent = 'No file selected';
    await refreshEvidenceLibrary();
    await loadFileBackupFolders();
  } catch (error) { $('fileBackupStatus').textContent = error.message; }
  finally {
    button.disabled = !selectedFileBackupRestore;
    $('fileBackupRestoreInput').disabled = false;
    $('fileBackupCreateButton').disabled = false;
  }
});
