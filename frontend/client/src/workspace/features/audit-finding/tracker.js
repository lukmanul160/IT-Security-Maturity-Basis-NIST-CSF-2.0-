// Isolated feature scope; reuse the workspace's existing DOM and helpers.
;(() => {
  const key = 'audit-finding-tracker';
  const kinds = ['audit', 'finding', 'followup', 'evidence'];
  const labels = ['Audit', 'Finding', 'Follow-up', 'Evidence'];
  let rows = [], path = [], editing = null, ready = false;
  const form = $('aftForm');
  const canWrite = () => ['admin', 'approver', 'editor'].includes(currentUserRole);
  const canDelete = () => ['admin', 'approver'].includes(currentUserRole);
  const status = message => { $('aftStatus').textContent = message; };
  // Compare local calendar dates: due today is not overdue; closed records never count.
  function isOverdue(record) {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return record.data.status !== 'Closed' && Boolean(record.data.dueDate) && record.data.dueDate < today;
  }
  function auditFindingDetails(audit) {
    const findings = rows.filter(row => row.kind === 'finding' && row.parentId === audit.id);
    const pending = findings.filter(row => row.data.status !== 'Closed');
    const overdue = pending.filter(isOverdue).length;
    pending.sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || (a.data.dueDate || '9999').localeCompare(b.data.dueDate || '9999'));
    return `<p class="muted">${findings.length} finding · ${findings.length - pending.length} selesai · ${pending.length} belum selesai · <strong>${overdue} lewat tenggat</strong></p><details class="insight-panel" data-aft-details="${audit.id}"><summary>Lihat ${pending.length} finding belum selesai</summary>${pending.length ? `<div class="excel-wrap"><table class="excel-table"><thead><tr><th>Finding / Severity</th><th>PIC</th><th>Status</th><th>Tenggat</th><th>Follow-up</th></tr></thead><tbody>${pending.map(finding => {
      const actions = rows.filter(row => row.kind === 'followup' && row.parentId === finding.id);
      return `<tr><td><strong>${escapeHtml(finding.data.title)}</strong><br>${escapeHtml(finding.data.severity)}<br><small>${escapeHtml(finding.data.description)}</small></td><td>${escapeHtml(finding.data.owner || 'Belum ditentukan')}</td><td>${escapeHtml(finding.data.status)}</td><td>${escapeHtml(finding.data.dueDate || 'Tanpa tenggat')}${isOverdue(finding) ? '<br><strong>Lewat tenggat</strong>' : ''}</td><td>${actions.filter(action => action.data.status === 'Closed').length}/${actions.length} selesai<br><button class="button button-quiet" type="button" data-aft-finding="${finding.id}">Buka Follow-up</button></td></tr>`;
    }).join('')}</tbody></table></div>` : `<p class="muted">${findings.length ? 'Semua finding sudah selesai.' : 'Belum ada finding pada audit ini.'}</p>`}</details>`;
  }
  async function request(url = '', options = {}) {
    const response = await fetch('/api/audit-finding-tracker' + url, options);
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Permintaan gagal'); }
    return response.status === 204 ? null : response.json();
  }
  function render() {
    const level = path.length, parentId = path.at(-1)?.id || null;
    $('aftNew').textContent = `Tambah ${labels[level]}`;
    $('aftNew').hidden = !canWrite();
    $('aftNew').disabled = !ready;
    $('aftReminderPanel').hidden = currentUserRole !== 'admin';
    $('aftAuditCount').textContent = rows.filter(r => r.kind === 'audit').length;
    $('aftOpenCount').textContent = rows.filter(r => r.kind === 'finding' && r.data.status !== 'Closed').length;
    $('aftFollowupCount').textContent = rows.filter(r => r.kind === 'followup').length;
    $('aftEvidenceCount').textContent = rows.filter(r => r.kind === 'evidence').length;
    $('aftOverdueAuditCount').textContent = rows.filter(r => r.kind === 'audit' && isOverdue(r)).length;
    $('aftOverdueFindingCount').textContent = rows.filter(r => r.kind === 'finding' && isOverdue(r)).length;
    $('aftBreadcrumb').innerHTML = [0, ...path.map((_, i) => i + 1)].map(i => `<button class="button ${i === level ? 'button-accent' : 'button-quiet'}" type="button" data-aft-level="${i}" ${i === level ? 'aria-current="page"' : ''}>${escapeHtml(i ? `${labels[i]}: ${path[i - 1].data.title}` : 'Semua Audit')}</button>`).join('');
    $('aftContext').textContent = path.length ? path.map(r => r.data.title).join(' → ') + (path.at(-1).data.description ? ' — ' + path.at(-1).data.description : '') : 'Pilih audit untuk melihat finding, lalu follow-up dan evidence terkait.';
    const search = $('aftSearch').value.toLowerCase();
    const visible = rows.filter(r => r.kind === kinds[level] && r.parentId === parentId && (!$('aftFilter').value || r.data.status === $('aftFilter').value) && Object.values(r.data).join(' ').toLowerCase().includes(search));
    $('aftBody').innerHTML = visible.map(r => `<tr><td>${escapeHtml(r.data.title)}<br><small>${escapeHtml(r.data.reference)}</small></td><td>${escapeHtml(r.data.owner || '—')}</td><td>${escapeHtml(r.data.status)}</td><td>${escapeHtml(r.data.dueDate || '—')}</td><td>${escapeHtml(r.kind === 'finding' ? r.data.severity : r.filename || '')}<br>${escapeHtml(r.data.description)}${r.kind === 'audit' ? auditFindingDetails(r) : ''}</td><td>${level < 3 ? `<button class="button button-quiet" data-aft-open="${r.id}">${labels[level + 1]} (${rows.filter(c => c.parentId === r.id).length})</button>` : `<a class="button button-quiet" href="/api/audit-finding-tracker/${r.id}/download">Unduh</a>`}${canWrite() ? `<button class="button button-quiet" data-aft-edit="${r.id}">Ubah</button>` : ''}${canDelete() ? `<button class="button button-danger" data-aft-delete="${r.id}">Hapus</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">Belum ada data yang sesuai.</td></tr>';
  }
  async function load() {
    ready = false; render(); status('Memuat data…');
    try { rows = await request(); path = path.map(r => rows.find(item => item.id === r.id)).filter(Boolean); ready = true; render(); status('Data terbaru berhasil dimuat.'); }
    catch (error) { status(error.message); }
  }
  function openForm(record) {
    editing = record || null; form.reset();
    if (record) for (const [name, value] of Object.entries(record.data)) if (form.elements.namedItem(name)) form.elements.namedItem(name).value = value;
    const kind = record?.kind || kinds[path.length];
    $('aftFormTitle').textContent = `${record ? 'Ubah' : 'Tambah'} ${labels[kinds.indexOf(kind)]}`;
    $('aftSeverityLabel').hidden = kind !== 'finding'; $('aftFileLabel').hidden = kind !== 'evidence';
    form.elements.file.required = kind === 'evidence' && !record;
    $('aftFormStatus').textContent = ''; $('aftModal').showModal();
  }
  document.querySelector(`[data-view="${key}"]`).addEventListener('click', () => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
    $('auditFindingView').classList.add('active-view'); saveUiState(key);
    document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === key));
    load();
  });
  $('aftNew').addEventListener('click', () => openForm());
  $('aftCancel').addEventListener('click', () => $('aftModal').close());
  $('aftRefresh').addEventListener('click', load);
  $('aftSearch').addEventListener('input', render); $('aftFilter').addEventListener('change', render);
  $('aftBreadcrumb').addEventListener('click', event => { const button = event.target.closest('[data-aft-level]'); if (!button) return; path = path.slice(0, Number(button.dataset.aftLevel)); $('aftSearch').value = ''; $('aftFilter').value = ''; render(); });
  $('aftBody').addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.aftFinding) {
      const finding = rows.find(row => row.id === button.dataset.aftFinding && row.kind === 'finding');
      const audit = rows.find(row => row.id === finding?.parentId && row.kind === 'audit');
      if (!audit || !finding) return;
      path = [audit, finding]; $('aftSearch').value = ''; $('aftFilter').value = ''; render();
      return;
    }
    const id = button.dataset.aftOpen || button.dataset.aftEdit || button.dataset.aftDelete;
    const row = rows.find(r => r.id === id); if (!row) return;
    if (button.dataset.aftOpen) { path.push(row); $('aftSearch').value = ''; $('aftFilter').value = ''; render(); }
    else if (button.dataset.aftEdit) openForm(row);
    else if (confirm(`Hapus "${row.data.title}"? Data dengan turunan tidak dapat dihapus.`)) {
      button.disabled = true;
      try { await request('/' + id, { method: 'DELETE' }); await load(); } catch (error) { status(error.message); button.disabled = false; }
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); const body = new FormData(form);
    body.set('kind', editing?.kind || kinds[path.length]); body.set('parentId', path.at(-1)?.id || '');
    if (!form.elements.file.files.length) body.delete('file');
    if (form.elements.file.files[0]?.size > 10 * 1024 * 1024) { $('aftFormStatus').textContent = 'Ukuran file maksimum 10 MB.'; return; }
    $('aftSave').disabled = true; $('aftCancel').disabled = true;
    try { await request(editing ? '/' + editing.id : '', { method: editing ? 'PUT' : 'POST', body }); $('aftModal').close(); await load(); }
    catch (error) { $('aftFormStatus').textContent = error.message; }
    finally { $('aftSave').disabled = false; $('aftCancel').disabled = false; }
  });
  const reminderControls = () => [...$('aftReminderForm').elements, $('aftReminderTest')];
  function populateReminder(data) {
    $('aftReminderEnabled').checked = data.enabled;
    $('aftReminderDays').value = data.daysBefore;
    $('aftReminderRecipients').value = data.recipients.join('\n');
    $('aftReminderConnection').textContent = data.smtpConfigured ? 'Menggunakan SMTP Admin yang sudah dikonfigurasi.' : 'SMTP Admin belum dikonfigurasi. Lengkapi koneksi sebelum mengaktifkan reminder.';
  }
  async function loadReminder() {
    reminderControls().forEach(control => { control.disabled = true; });
    $('aftReminderStatus').textContent = 'Memuat pengaturan...';
    try {
      populateReminder(await request('/reminder-settings'));
      reminderControls().forEach(control => { control.disabled = false; });
      $('aftReminderStatus').textContent = 'Pengaturan siap diedit.';
    } catch (error) { $('aftReminderStatus').textContent = error.message; $('aftReminderReload').disabled = false; }
  }
  $('aftReminderPanel').addEventListener('toggle', () => { if ($('aftReminderPanel').open && currentUserRole === 'admin') loadReminder(); });
  $('aftReminderReload').addEventListener('click', loadReminder);
  $('aftReminderSmtp').addEventListener('click', () => { $('accountButton').click(); document.querySelector('[data-account-tab="smtp"]').click(); });
  $('aftReminderForm').addEventListener('submit', async event => {
    event.preventDefault();
    $('aftReminderSave').disabled = true;
    try {
      const data = await request('/reminder-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: $('aftReminderEnabled').checked, daysBefore: Number($('aftReminderDays').value), recipients: $('aftReminderRecipients').value.split('\n').map(to => to.trim()).filter(Boolean) }) });
      populateReminder(data);
      $('aftReminderStatus').textContent = data.enabled ? 'Reminder tersimpan dan aktif. Jadwal diperiksa paling lambat satu jam lagi.' : 'Pengaturan tersimpan. Reminder otomatis nonaktif.';
    } catch (error) { $('aftReminderStatus').textContent = error.message; }
    finally { $('aftReminderSave').disabled = false; }
  });
  $('aftReminderTest').addEventListener('click', async () => {
    const input = $('aftReminderTestTo');
    if (!input.value || !input.reportValidity()) { $('aftReminderStatus').textContent = 'Isi email tujuan percobaan yang valid.'; return; }
    $('aftReminderTest').disabled = true; $('aftReminderStatus').textContent = 'Mengirim email percobaan...';
    try { $('aftReminderStatus').textContent = (await request('/reminder-settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: input.value.trim() }) })).message; }
    catch (error) { $('aftReminderStatus').textContent = error.message; }
    finally { $('aftReminderTest').disabled = false; }
  });
})();
