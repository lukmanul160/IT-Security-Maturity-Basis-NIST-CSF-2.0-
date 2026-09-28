// Isolated feature scope; reuse the workspace's existing DOM and helpers.
;(() => {
  const key = 'audit-finding-tracker';
  const kinds = ['audit', 'finding', 'followup', 'evidence'];
  const labels = ['Audit', 'Finding', 'Follow-up', 'Evidence'];
  let rows = [], path = [], editing = null, ready = false;
  let cardFilter = null;
  const cardFilters = {
    'open-findings': { title: 'Finding terbuka', matches: row => row.kind === 'finding' && row.data.status !== 'Closed' },
    'closed-findings': { title: 'Finding selesai', matches: row => row.kind === 'finding' && row.data.status === 'Closed' },
    followups: { title: 'Semua Follow-up', matches: row => row.kind === 'followup' },
    evidence: { title: 'Semua Evidence', matches: row => row.kind === 'evidence' },
    'overdue-audits': { title: 'Audit lewat tenggat', matches: row => row.kind === 'audit' && isOverdue(row) },
    'overdue-findings': { title: 'Finding lewat tenggat', matches: row => row.kind === 'finding' && isOverdue(row) }
  };
  function ancestors(row) {
    const chain = [], visited = new Set([row.id]);
    let parent = rows.find(item => item.id === row.parentId);
    while (parent && !visited.has(parent.id)) {
      chain.unshift(parent); visited.add(parent.id);
      parent = rows.find(item => item.id === parent.parentId);
    }
    return chain;
  }
  function openCard(filter) {
    if (!ready) return;
    cardFilter = cardFilters[filter] ? filter : null; path = [];
    $('aftSearch').value = ''; $('aftFilter').value = '';
    setTab('manage'); render(); $('aftManageTab').focus();
  }
  document.querySelectorAll('[data-aft-card]').forEach(card => {
    card.addEventListener('click', () => openCard(card.dataset.aftCard));
    card.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault(); openCard(card.dataset.aftCard);
    });
  });
  const form = $('aftForm');
  const canWrite = () => ['admin', 'approver', 'editor'].includes(currentUserRole);
  const canDelete = () => ['admin', 'approver'].includes(currentUserRole);
  const status = message => { $('aftStatus').textContent = message; };
  function setTab(tab) {
    if (!['dashboard', 'smtp', 'manage'].includes(tab)) return;
    const panels = { dashboard: 'aftDashboardPanel', smtp: 'aftSmtpPanel', manage: 'aftManagePanel' };
    document.querySelectorAll('[data-aft-tab]').forEach(button => {
      const active = button.dataset.aftTab === tab;
      button.classList.toggle('button-accent', active);
      button.classList.toggle('button-quiet', !active);
      button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    });
    Object.entries(panels).forEach(([name, id]) => { $(id).hidden = name !== tab; });
    $('aftReminderPanel').hidden = currentUserRole !== 'admin';
    $('aftReminderAccess').hidden = currentUserRole === 'admin';
    if (tab === 'smtp' && currentUserRole === 'admin') loadReminder();
  }
  document.querySelectorAll('[data-aft-tab]').forEach((button, index, buttons) => {
    button.addEventListener('click', () => setTab(button.dataset.aftTab));
    button.addEventListener('keydown', event => {
      const positions = { ArrowRight: (index + 1) % buttons.length, ArrowLeft: (index + buttons.length - 1) % buttons.length, Home: 0, End: buttons.length - 1 };
      if (positions[event.key] === undefined) return;
      event.preventDefault(); const target = buttons[positions[event.key]]; target.focus(); target.click();
    });
  });
  $('aftDashboardManage').addEventListener('click', () => openCard('audits'));
  $('aftDashboardManageInline').addEventListener('click', () => openCard('audits'));
  $('aftDashboardRefresh').addEventListener('click', load);
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
    $('aftNew').hidden = !canWrite() || Boolean(cardFilter);
    $('aftNew').disabled = !ready;
    document.querySelectorAll('[data-aft-card]').forEach(card => card.setAttribute('aria-disabled', String(!ready)));
    $('aftReminderPanel').hidden = currentUserRole !== 'admin';
    $('aftAuditCount').textContent = rows.filter(r => r.kind === 'audit').length;
    $('aftOpenCount').textContent = rows.filter(r => r.kind === 'finding' && r.data.status !== 'Closed').length;
    const findings = rows.filter(r => r.kind === 'finding');
    const closedFindings = findings.filter(r => r.data.status === 'Closed').length;
    const overdueFindings = findings.filter(r => isOverdue(r)).length;
    $('aftClosedFindingCount').textContent = closedFindings;
    $('aftResolutionRate').textContent = `${findings.length ? Math.round((closedFindings / findings.length) * 100) : 0}% penyelesaian`;
    $('aftFindingSummary').innerHTML = [
      ['Belum selesai', findings.length - closedFindings, '#2c7be5'],
      ['Lewat tenggat', overdueFindings, '#b43f37'],
      ['Selesai', closedFindings, '#21734f']
    ].map(([label, value, color]) => `<div class="risk-summary-row"><span>${label}</span><strong>${value}</strong><i><b style="width:${findings.length ? Math.round((value / findings.length) * 100) : 0}%;background:${color}"></b></i></div>`).join('');
    if ($('aftFollowupCount')) $('aftFollowupCount').textContent = rows.filter(r => r.kind === 'followup').length;
    if ($('aftEvidenceCount')) $('aftEvidenceCount').textContent = rows.filter(r => r.kind === 'evidence').length;
    $('aftOverdueAuditCount').textContent = rows.filter(r => r.kind === 'audit' && isOverdue(r)).length;
    $('aftOverdueFindingCount').textContent = overdueFindings;
    $('aftBreadcrumb').innerHTML = [0, ...path.map((_, i) => i + 1)].map(i => `<button class="button ${i === level ? 'button-accent' : 'button-quiet'}" type="button" data-aft-level="${i}" ${i === level ? 'aria-current="page"' : ''}>${escapeHtml(i ? `${labels[i]}: ${path[i - 1].data.title}` : 'Semua Audit')}</button>`).join('');
    $('aftContext').textContent = path.length ? path.map(r => r.data.title).join(' → ') + (path.at(-1).data.description ? ' — ' + path.at(-1).data.description : '') : 'Pilih audit untuk melihat finding, lalu follow-up dan evidence terkait.';
    const search = $('aftSearch').value.toLowerCase();
    const scope = cardFilters[cardFilter];
    const visible = rows.filter(r => (scope ? scope.matches(r) : r.kind === kinds[level] && r.parentId === parentId) && (!$('aftFilter').value || r.data.status === $('aftFilter').value) && Object.values(r.data).join(' ').toLowerCase().includes(search));
    if (scope) $('aftContext').textContent = `${scope.title} — ${visible.length} data. Pilih Semua Audit untuk kembali ke daftar audit.`;
    $('aftBody').innerHTML = visible.map(r => `<tr><td>${escapeHtml(r.data.title)}<br><small>${escapeHtml(r.data.reference)}</small>${cardFilter && r.parentId ? `<br><small>${escapeHtml(ancestors(r).map(parent => parent.data.title).join(" ? "))}</small>` : ""}</td><td>${escapeHtml(r.data.owner || '—')}</td><td>${escapeHtml(r.data.status)}</td><td>${escapeHtml(r.data.dueDate || '—')}</td><td>${escapeHtml(r.kind === 'finding' ? r.data.severity : r.filename || '')}<br>${escapeHtml(r.data.description)}${r.kind === 'audit' ? auditFindingDetails(r) : ''}</td><td>${r.kind !== 'evidence' ? `<button class="button button-quiet" data-aft-open="${r.id}">${labels[kinds.indexOf(r.kind) + 1]} (${rows.filter(c => c.parentId === r.id).length})</button>` : `<a class="button button-quiet" href="/api/audit-finding-tracker/${r.id}/download">Unduh</a>`}${canWrite() ? `<button class="button button-quiet" data-aft-edit="${r.id}">Ubah</button>` : ''}${canDelete() ? `<button class="button button-danger" data-aft-delete="${r.id}">Hapus</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">Belum ada data yang sesuai.</td></tr>';
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
    setTab('dashboard');
    load();
  });
  $('aftNew').addEventListener('click', () => openForm());
  $('aftCancel').addEventListener('click', () => $('aftModal').close());
  $('aftRefresh').addEventListener('click', load);
  $('aftSearch').addEventListener('input', render); $('aftFilter').addEventListener('change', render);
  $('aftBreadcrumb').addEventListener('click', event => { const button = event.target.closest('[data-aft-level]'); if (!button) return; cardFilter = null; path = path.slice(0, Number(button.dataset.aftLevel)); $('aftSearch').value = ''; $('aftFilter').value = ''; render(); });
  $('aftBody').addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.aftFinding) {
      const finding = rows.find(row => row.id === button.dataset.aftFinding && row.kind === 'finding');
      const audit = rows.find(row => row.id === finding?.parentId && row.kind === 'audit');
      if (!audit || !finding) return;
      cardFilter = null; path = [audit, finding]; $('aftSearch').value = ''; $('aftFilter').value = ''; render();
      return;
    }
    const id = button.dataset.aftOpen || button.dataset.aftEdit || button.dataset.aftDelete;
    const row = rows.find(r => r.id === id); if (!row) return;
    if (button.dataset.aftOpen) { cardFilter = null; path = [...ancestors(row), row]; $('aftSearch').value = ''; $('aftFilter').value = ''; render(); }
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
