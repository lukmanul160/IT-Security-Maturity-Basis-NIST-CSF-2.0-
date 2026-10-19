async function fileBackupRequest(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'File backup gagal diproses');
  return data;
}
async function loadFileBackups() {
  const rows = await fileBackupRequest('/api/file-backups');
  $('fileBackupCount').textContent = `${rows.length} backups`;
  $('fileBackupBody').innerHTML = rows.map(row => `<tr><td><strong>${escapeHtml(row.fileName)}</strong>${row.partCount ? `<br><span class="muted">Bagian ${row.part} / ${row.partCount} ? pilih semua bagian saat restore</span>` : ""}</td><td>${(globalThis.NistI18n?.dateHtml?.(row.createdAt, {year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'}) ?? escapeHtml(new Date(row.createdAt).toLocaleString(globalThis.NistI18n?.locale || 'id-ID', {year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit'})))}</td><td>${formatBackupSize(row.size)}</td><td><div class="backup-row-actions"><a class="attachment-action-button" href="/api/file-backups/${encodeURIComponent(row.fileName)}">Download</a><button class="attachment-action-button danger" type="button" data-file-backup-delete="${escapeHtml(row.fileName)}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="4">Belum ada file backup.</td></tr>';
}
function renderFileBackupFolders(target, folders) {
  const input = $(target), tree = $(target + 'Tree');
  const paths = new Set();
  folders.forEach(folder => {
    const parts = folder.split('/');
    for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('/'));
  });
  let selected;
  try { selected = JSON.parse(input.value); } catch { selected = ['']; }
  if (!Array.isArray(selected)) selected = [''];
  selected = new Set(selected.filter(path => path === '' || paths.has(path)));
  const children = new Map([['', []]]), checks = new Map();
  [...paths].sort((a,b) => a.localeCompare(b)).forEach(path => {
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(path);
  });
  tree.replaceChildren();
  function update() {
    input.value = JSON.stringify([...selected]);
    checks.forEach((check, path) => {
      const inherited = path !== '' && [...selected].some(parent => parent === '' || path.startsWith(parent + '/'));
      check.checked = selected.has(path) || inherited;
      check.disabled = inherited;
      check.title = inherited ? 'Termasuk dalam folder induk yang dicentang. Lepas centang induk untuk memilih subfolder terpisah.' : '';
      check.indeterminate = !check.checked && [...selected].some(child => path === '' || child.startsWith(path + '/'));
    });
  }
  function add(path, container) {
    const row = document.createElement('div'); row.className = 'file-backup-folder-row';
    const branch = document.createElement('div'); branch.className = 'file-backup-folder-children';
    const descendants = children.get(path) || [];
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'file-backup-folder-toggle';
    toggle.textContent = descendants.length ? '\u25b8' : '\u00b7';
    toggle.disabled = !descendants.length;
    toggle.setAttribute('aria-label', 'Buka subfolder ' + (path || 'Semua folder'));
    toggle.setAttribute('aria-expanded', String(path === ''));
    branch.hidden = path !== '';
    toggle.addEventListener('click', () => {
      branch.hidden = !branch.hidden;
      toggle.setAttribute('aria-expanded', String(!branch.hidden));
      toggle.textContent = branch.hidden ? '\u25b8' : '\u25be';
    });
    if (path === '' && descendants.length) toggle.textContent = '\u25be';
    const label = document.createElement('label');
    const check = document.createElement('input'); check.type = 'checkbox'; check.dataset.folder = path;
    const text = document.createElement('span'); text.textContent = path ? path.split('/').at(-1) : 'Semua folder';
    label.title = path || 'Semua folder'; label.append(check, text); checks.set(path, check);
    check.addEventListener('change', () => {
      if (path === '') { selected = new Set(check.checked ? [''] : []); }
      else {
        [...selected].filter(child => child === path || child.startsWith(path + '/')).forEach(child => selected.delete(child));
        if (check.checked) selected.add(path);
      }
      update();
    });
    row.append(toggle, label); container.append(row, branch);
    descendants.forEach(child => add(child, branch));
  }
  add('', tree); update();
}
async function loadFileBackupFolders() {
  renderFileBackupFolders('fileBackupFolder', await fileBackupRequest('/api/file-backups/folders'));
}
renderFileBackupFolders('fileBackupFolder', []);
renderFileBackupFolders('fileBackupRestoreFolder', []);
let fileBackupInspection = 0;
async function createFileBackup() {
  const button = $('fileBackupCreateButton');
  button.disabled = true;
  $('fileBackupRestoreButton').disabled = true;
  $('fileBackupRestoreInput').disabled = true;
  window.NistUploadProgress.setProgress('fileBackup', { label: 'Membuat arsip file di server...', detail: 'Membaca file dan membuat seluruh bagian ZIP. Persentase pemrosesan server belum tersedia.' });
  const folders = JSON.parse($('fileBackupFolder').value);
  $('fileBackupStatus').textContent = folders.includes('') ? 'Membuat backup seluruh file unggahan...' : `Membuat backup ${folders.length} folder...`;
  try {
    const data = await fileBackupRequest('/api/file-backups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folders }) });
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
function renderFileRestoreQueue() {
  const queue = $('fileBackupRestoreQueue'); queue.replaceChildren(); queue.hidden = !selectedFileBackupRestore.length;
  $('fileBackupRestoreClearButton').hidden = !selectedFileBackupRestore.length;
  selectedFileBackupRestore.forEach(file => {
    const row = document.createElement('li');
    const label = document.createElement('span'); label.textContent = `${file.name} (${formatBackupSize(file.size)})`;
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'button button-quiet'; remove.textContent = 'Hapus dari pilihan';
    remove.setAttribute('aria-label', `Hapus ${file.name} dari pilihan`);
    remove.addEventListener('click', () => {
      if ($('fileBackupRestoreInput').disabled) return;
      selectedFileBackupRestore = selectedFileBackupRestore.filter(item => item !== file);
      inspectFileRestoreSelection();
    });
    row.append(label, remove); queue.append(row);
  });
}
$('fileBackupRestoreInput').addEventListener('change', event => {
  if (event.target.disabled) return;
  const files = new Map(selectedFileBackupRestore.map(file => [file.name, file]));
  Array.from(event.target.files || []).forEach(file => files.set(file.name, file));
  selectedFileBackupRestore = [...files.values()]; event.target.value = '';
  inspectFileRestoreSelection();
});
$('fileBackupRestoreClearButton').addEventListener('click', () => {
  if ($('fileBackupRestoreInput').disabled) return;
  selectedFileBackupRestore = []; inspectFileRestoreSelection();
});
async function inspectFileRestoreSelection() {
  const inspection = ++fileBackupInspection;
  if (selectedFileBackupRestore.some(file => file.size > 500 * 1024 * 1024 || !/\.zip$/i.test(file.name))) {
    selectedFileBackupRestore = [];
    renderFileRestoreQueue();
    $('fileBackupRestoreInput').value = '';
    $('fileBackupStatus').textContent = 'Pilih bagian ZIP maksimal 500 MB per bagian. Ukuran total batch tidak dibatasi.';
  }
  renderFileRestoreQueue();
  $('fileBackupRestoreFileName').textContent = selectedFileBackupRestore.length ? `${selectedFileBackupRestore.length} ZIP · ${formatBackupSize(selectedFileBackupRestore.reduce((sum, file) => sum + file.size, 0))}` : 'No file selected';
  $('fileBackupRestoreFileName').title = selectedFileBackupRestore.map(file => file.name).join('\n');
  window.NistUploadProgress.showFiles('fileBackup', selectedFileBackupRestore);
  $('fileBackupProgressPanel').hidden = true;
  $('fileBackupRestoreButton').disabled = true;
  $('fileBackupRestoreFolder').value = '[""]';
  renderFileBackupFolders('fileBackupRestoreFolder', []);
  if (!selectedFileBackupRestore.length) return;
  $('fileBackupStatus').textContent = 'Memeriksa folder dalam backup...';
  try {
    const body = new FormData();
    selectedFileBackupRestore.forEach(file => body.append('backups', file));
    const result = await fileBackupRequest('/api/file-backups/inspect', { method: 'POST', body });
    if (inspection !== fileBackupInspection) return;
    renderFileBackupFolders('fileBackupRestoreFolder', result.folders);
    $('fileBackupRestoreButton').disabled = false;
    $('fileBackupStatus').textContent = 'Folder backup siap dipilih. Restore akan memvalidasi kelengkapan seluruh bagian sebelum menulis file.';
  } catch (error) {
    if (inspection === fileBackupInspection) $('fileBackupStatus').textContent = error.message;
  }
}
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
    body.append('folders', $('fileBackupRestoreFolder').value);
    const result = await fileBackupRequest('/api/file-backups/restore-batch', { method: 'POST', body, uploadProgressTarget: 'fileBackup' });
    $('fileBackupStatus').textContent = `Restore berhasil: ${result.fileCount} file dipulihkan.`;
    if (result.missingFiles?.length) $('fileBackupStatus').textContent += ` Perhatian: backup asal tidak lengkap; ${result.missingFiles.length} file tidak tersedia saat backup dibuat dan perlu diunggah ulang.`;
    window.NistUploadProgress.showFiles('fileBackup', selectedFileBackupRestore, 'Dipulihkan');
    window.NistUploadProgress.setProgress('fileBackup', { phase: 'success', label: 'Batch restore selesai', percent: 100, detail: `${result.fileCount} file dipulihkan dari ${selectedFileBackupRestore.length} ZIP.` });
    selectedFileBackupRestore = [];
    renderFileRestoreQueue();
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
