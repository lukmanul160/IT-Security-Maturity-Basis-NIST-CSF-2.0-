async function loadAuditTrail() { const eventType = $('auditEventFilter')?.value || ''; const response = await fetch(`/api/audit?limit=${auditPageSize}&offset=${(auditPage - 1) * auditPageSize}${eventType ? `&eventType=${encodeURIComponent(eventType)}` : ''}`, { cache: 'no-store' }); if (!response.ok) return; const rows = await response.json(); $('auditBody').innerHTML = rows.map(row => `<tr><td>${escapeHtml(new Date(row.createdAt).toLocaleString('id-ID'))}</td><td>${escapeHtml(row.actorUsername || 'anonymous')}<br><small>${escapeHtml(row.actorRole || '')}</small></td><td>${escapeHtml(row.eventType)}</td><td>${escapeHtml(row.method)}</td><td>${escapeHtml(row.path)}</td><td>${escapeHtml(String(row.statusCode))}</td><td title="${escapeHtml(row.requestId)}">${escapeHtml(row.requestId.slice(0, 12))}</td></tr>`).join('') || '<tr><td colspan="7">Belum ada aktivitas.</td></tr>'; $('auditPagination').innerHTML = `<button type="button" data-audit-page="${auditPage - 1}" ${auditPage === 1 ? 'disabled' : ''}>Previous</button><span>Page ${auditPage}${rows.length === auditPageSize ? '+' : ''}</span><button type="button" data-audit-page="${auditPage + 1}" ${rows.length < auditPageSize ? 'disabled' : ''}>Next</button>`; }
function formatBackupSize(bytes) { const value = Number(bytes) || 0; if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / (1024 * 1024)).toFixed(1)} MB`; }
async function loadBackups() { const response = await fetch('/api/backups', { cache: 'no-store' }); if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Backup list unavailable'); const rows = await response.json(); $('backupCount').textContent = `${rows.length} backup${rows.length === 1 ? '' : 's'}`; $('backupBody').innerHTML = rows.map(row => `<tr><td><strong>${escapeHtml(row.fileName)}</strong></td><td>${escapeHtml(new Date(row.createdAt).toLocaleString('id-ID'))}</td><td>${formatBackupSize(row.size)}</td><td><div class="backup-row-actions"><a class="attachment-action-button" href="/api/backups/${encodeURIComponent(row.fileName)}">Download</a><button class="attachment-action-button danger" type="button" data-backup-delete="${escapeHtml(row.fileName)}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="4">Belum ada database backup.</td></tr>'; }
async function deleteBackup(fileName) { if (!confirm(`Hapus backup ${fileName}?`)) return; const status = $('backupStatus'); const response = await fetch(`/api/backups/${encodeURIComponent(fileName)}`, { method: 'DELETE' }); if (!response.ok) { status.textContent = (await response.json().catch(() => ({}))).error || 'Backup delete failed'; return; } status.textContent = `Backup dihapus: ${fileName}`; await loadBackups(); }
async function createBackup() { const button = $('backupCreateButton'); const status = $('backupStatus'); button.disabled = true; status.textContent = 'Membuat backup database...'; try { const response = await fetch('/api/backups', { method: 'POST' }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Database backup failed'); status.textContent = `Backup berhasil dibuat: ${data.fileName}`; await loadBackups(); } catch (error) { status.textContent = error.message; } finally { button.disabled = false; } }
let selectedRestoreFile = null;
function selectRestoreFile(event) { selectedRestoreFile = event.target.files?.[0] || null; $('backupRestoreFileName').textContent = selectedRestoreFile?.name || 'No file selected'; $('backupRestoreButton').disabled = !selectedRestoreFile; }
async function restoreBackup() { if (!selectedRestoreFile || !confirm('Restore akan mengganti data database saat ini dan tidak dapat dibatalkan. Lanjutkan?')) return; const button = $('backupRestoreButton'); const status = $('backupStatus'); const formData = new FormData(); formData.append('backup', selectedRestoreFile, selectedRestoreFile.name); button.disabled = true; status.textContent = 'Restoring database...'; try { const response = await fetch('/api/backups/restore', { method: 'POST', body: formData }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Database restore failed'); status.textContent = `Restore berhasil: ${data.fileName}`; selectedRestoreFile = null; $('backupRestoreInput').value = ''; $('backupRestoreFileName').textContent = 'No file selected'; await loadBackups(); } catch (error) { status.textContent = error.message; button.disabled = false; } }
function showBackupsView() { document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('backupsView').classList.add('active-view'); document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'backups')); saveUiState('backups'); loadBackups().catch(error => { $('backupStatus').textContent = error.message; }); }
const accountTabPanels = { profile: 'accountProfilePanel', permissions: 'permissionManagementPanel', matrix: 'accountAccessMatrixPanel', users: 'accountUsersPanel', audit: 'accountAuditPanel', smtp: 'accountSmtpPanel' };
let activeAccountTab = 'profile';
function setAccountTab(tab = activeAccountTab) {
  const admin = currentUserRole === 'admin';
  activeAccountTab = Object.hasOwn(accountTabPanels, tab) && (admin || tab === 'profile') ? tab : 'profile';
  $('accountAdminPanel').hidden = !admin;
  document.querySelectorAll('[data-account-tab]').forEach(button => {
    const active = button.dataset.accountTab === activeAccountTab;
    button.hidden = button.dataset.accountTab !== 'profile' && !admin;
    button.disabled = button.hidden;
    button.classList.toggle('button-accent', active);
    button.classList.toggle('button-quiet', !active);
    button.setAttribute('aria-selected', String(active));
  });
  Object.entries(accountTabPanels).forEach(([key,id]) => { $(id).hidden = key !== activeAccountTab; });
}
document.querySelectorAll('[data-account-tab]').forEach(button => button.addEventListener('click', () => setAccountTab(button.dataset.accountTab)));
async function loadAccountData() {
  try {
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    if (!response.ok) throw new Error('Data akun belum dapat dimuat. Buka kembali Account untuk mencoba lagi.');
    const user = await response.json();
    currentUserRole = user.role;
    currentUserPermissions = user.permissions?.length ? user.permissions : currentUserPermissions;
    $('accountUsername').value = user.username;
    $('accountFullName').value = user.fullName || '';
    setAccountTab();
    if (user.role === 'admin') {
      const results = await Promise.allSettled([loadAccountUsers(), loadPermissions(), loadAuditTrail()]);
      const statusIds = ['accountUserStatus','permissionStatus','accountProfileStatus'];
      results.forEach((result,index) => { if (result.status === 'rejected') $(statusIds[index]).textContent = 'Sebagian data belum dapat dimuat. Buka kembali Account untuk mencoba lagi.'; });
    }
  } catch (error) { $('accountProfileStatus').textContent = error.message; }
}

async function loadPermissions() {
  const selected = $('permissionRoleSelect').value;
  try {
    const response=await fetch('/api/auth/permissions',{cache:'no-store'});
    if(!response.ok)throw new Error('Pengaturan hak akses belum dapat dimuat.');
    const data=await response.json();
    if(data.assignments.some(row=>!row.actions))throw new Error('Restart server untuk mengaktifkan pengaturan izin per aksi.');
    $('permissionRoleSelect').innerHTML=[...new Set(data.assignments.map(row=>row.role))].map(role=>`<option value="${role}">${role}</option>`).join('');
    if(selected)$('permissionRoleSelect').value=selected;
    renderPermissionChecks(data); renderPermissionMatrix(data);
    $('permissionSaveButton').disabled=$('permissionRoleSelect').value==='admin';
  } catch(error) { $('permissionStatus').textContent=error.message; $('permissionSaveButton').disabled=true; }
}
const permissionActions = [['read','Read / View'],['create','Tambah'],['update','Edit'],['delete','Delete']];
function renderPermissionChecks(data) {
  const role=$('permissionRoleSelect').value;
  $('permissionChecks').innerHTML=`<div class="excel-wrap"><table class="excel-table"><thead><tr><th>Fitur</th>${permissionActions.map(([,label])=>`<th>${label}</th>`).join('')}</tr></thead><tbody>${data.permissions.map(([key,label])=>{
    const assignment=data.assignments.find(row=>row.role===role && row.permissionKey===key);
    return `<tr><th>${escapeHtml(label)}</th>${permissionActions.map(([action,label])=>`<td><input type="checkbox" data-permission-key="${key}" data-permission-action="${action}" aria-label="${escapeHtml(label)} ${escapeHtml(key)}" ${assignment?.actions?.[action] ? 'checked' : ''} ${role==='admin' || key==='account' && action!=='read' ? 'disabled' : ''}></td>`).join('')}</tr>`;
  }).join('')}</tbody></table></div><p class="muted">Read/View wajib untuk aksi lainnya. Izin file tetap dibatasi pemilik file. Pengelolaan pegawai, katalog sertifikasi, akun, SMTP, dan reset tetap khusus admin.</p>`;
  $('permissionManagementPanel').dataset.permissions=JSON.stringify(data);
  $('permissionSaveButton').disabled=role==='admin';
}
$('permissionChecks').addEventListener('change',event=>{
  const input=event.target;
  if(!input.dataset.permissionKey)return;
  const group=[...$('permissionChecks').querySelectorAll('input')].filter(field=>field.dataset.permissionKey===input.dataset.permissionKey);
  if(input.dataset.permissionAction==='read' && !input.checked)group.forEach(field=>field.checked=false);
  if(input.dataset.permissionAction!=='read' && input.checked)group.find(field=>field.dataset.permissionAction==='read').checked=true;
});
function renderPermissionMatrix(data) {
  const roles=[...new Set(data.assignments.map(row=>row.role))];
  $('permissionMatrix').innerHTML=`<table class="permission-matrix-table"><thead><tr><th>Fitur</th>${roles.map(role=>`<th>${role}</th>`).join('')}</tr></thead><tbody>${data.permissions.map(([key,label])=>`<tr><th>${escapeHtml(label)}</th>${roles.map(role=>{const row=data.assignments.find(item=>item.role===role && item.permissionKey===key);return `<td>${permissionActions.filter(([action])=>row?.actions?.[action]).map(([,label])=>label).join(', ') || '-'}</td>`;}).join('')}</tr>`).join('')}</tbody></table>`;
}
function togglePermissionCell() { /* Matrix is a read-only summary; edit the selected role above. */ }
$('permissionRoleSelect').addEventListener('change',()=>renderPermissionChecks(JSON.parse($('permissionManagementPanel').dataset.permissions)));
$('permissionSaveButton').addEventListener('click',savePermissions);
async function savePermissions() {
  const role=$('permissionRoleSelect').value, actions={};
  $('permissionChecks').querySelectorAll('input[data-permission-action]').forEach(input=>{(actions[input.dataset.permissionKey] ||= {})[input.dataset.permissionAction]=input.checked;});
  const permissions=Object.keys(actions).filter(key=>actions[key].read);
  $('permissionSaveButton').disabled=true;
  try {
    const response=await fetch(`/api/auth/permissions/${role}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({permissions,actions})});
    if(!response.ok)throw new Error((await response.json()).error || 'Save failed');
    await loadPermissions(); $('permissionStatus').textContent=`Izin ${role} tersimpan. Pengguna perlu memuat ulang halaman untuk memperbarui tampilan.`;
  } catch(error) { $('permissionStatus').textContent=error.message; }
  finally { $('permissionSaveButton').disabled=role==='admin'; }
}
async function loadAccountUsers() { const response = await fetch('/api/auth/users', { cache: 'no-store' }); if (!response.ok) return; accountUsers = await response.json(); accountUsersPage = renderListPagination('accountUsersPagination', accountUsersPage, accountUsers.length, 'users'); const visible = accountUsers.slice((accountUsersPage - 1) * 20, accountUsersPage * 20); $('accountUsersBody').innerHTML = visible.map(user => `<tr><td>${escapeHtml(user.username)}</td><td>${escapeHtml(user.fullName)}</td><td>${escapeHtml(user.role)}</td><td><button class="attachment-action-button" type="button" data-account-edit="${user.id}">Edit</button><button class="attachment-action-button danger" type="button" data-account-delete="${user.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="4">No users found.</td></tr>'; }
function editAccountUser(id) { const user = accountUsers.find(item => String(item.id) === String(id)); if (!user) return; $('accountUserId').value = user.id; $('accountUserUsername').value = user.username; $('accountUserUsername').readOnly = true; $('accountUserFullName').value = user.fullName; $('accountUserRole').value = user.role; $('accountUserPassword').value = ''; $('accountUserFormTitle').textContent = `Edit ${user.username}`; }
async function deleteAccountUser(id) { if (!confirm('Hapus akun ini?')) return; const response = await fetch(`/api/auth/users/${id}`, { method: 'DELETE' }); $('accountUserStatus').textContent = response.ok ? 'User deleted' : 'Delete failed'; if (response.ok) await loadAccountUsers(); }
async function saveAccountProfile(event) { event.preventDefault(); const currentPassword = $('accountCurrentPassword').value; const newPassword = $('accountNewPassword').value; const confirmPassword = $('accountConfirmPassword').value; const changingPassword = Boolean(currentPassword || newPassword || confirmPassword); const data = currentUserRole === 'admin' || !changingPassword ? { fullName: $('accountFullName').value, ...(changingPassword ? { currentPassword, newPassword, confirmPassword } : {}) } : { currentPassword, newPassword, confirmPassword }; const endpoint = currentUserRole === 'admin' || !changingPassword ? '/api/auth/me' : '/api/auth/me/password'; const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); $('accountProfileStatus').textContent = response.ok ? 'Profile saved' : ((await response.json().catch(() => ({}))).error || 'Save failed'); if (response.ok) { $('accountCurrentPassword').value = ''; $('accountNewPassword').value = ''; $('accountConfirmPassword').value = ''; } }
async function saveAccountUser(event) { event.preventDefault(); const id = $('accountUserId').value; const data = { fullName: $('accountUserFullName').value, role: $('accountUserRole').value }; if (!id) Object.assign(data, { username: $('accountUserUsername').value, password: $('accountUserPassword').value }); else if ($('accountUserPassword').value) data.password = $('accountUserPassword').value; const response = await fetch(id ? `/api/auth/users/${id}` : '/api/auth/users', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); $('accountUserStatus').textContent = response.ok ? 'User saved' : ((await response.json().catch(() => ({}))).error || 'Save failed'); if (response.ok) { $('accountUserCancel').click(); await loadAccountUsers(); } }
function resetAccountUserForm() { $('accountUserId').value = ''; $('accountUserUsername').value = ''; $('accountUserUsername').readOnly = false; $('accountUserFullName').value = ''; $('accountUserPassword').value = ''; $('accountUserRole').value = 'editor'; $('accountUserFormTitle').textContent = 'Create user'; }
function showAccountView() { setAccountTab('profile'); document.querySelectorAll('.view').forEach(view => view.classList.remove('active-view')); $('accountView').classList.add('active-view'); document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active')); loadAccountData(); }
$('auditRefreshButton')?.addEventListener('click', () => { auditPage = 1; loadAuditTrail(); }); $('auditEventFilter')?.addEventListener('change', () => { auditPage = 1; loadAuditTrail(); }); $('auditPagination')?.addEventListener('click', event => { const button = event.target.closest('[data-audit-page]'); if (!button || button.disabled) return; auditPage = Number(button.dataset.auditPage); loadAuditTrail(); });
