// State and event handling shared by the two simple compliance registers.
;(() => {
  const configurations = [
    { kind: 'reports', key: 'reporting-regulator', prefix: 'complianceReport', view: 'reportingRegulatorView', label: 'pelaporan' },
    { kind: 'contacts', key: 'narahubung', prefix: 'complianceContact', view: 'narahubungView', label: 'narahubung' }
  ];
  const html = value => escapeHtml(String(value ?? ''));
  const today = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const overdue = data => data.status !== 'Sudah dilaporkan' && data.dueDate < today();
  async function request(path, options = {}) {
    const response = await fetch(`/api/compliance/${path}`, { cache: 'no-store', ...options });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Gagal memproses data compliance.');
    return response.status === 204 ? null : response.json();
  }
  function reminderDescription(reminder) {
    if (!reminder) return 'Hubungan reminder belum dimuat.';
    const unit = value => value === 'months' ? 'bulan' : 'hari';
    const schedule = `H-${reminder.daysBefore} ${unit(reminder.startUnit)}; ` + (reminder.repeatDaily ? `setiap ${reminder.repeatEvery} ${unit(reminder.repeatUnit)}${reminder.continueOverdue ? ' sampai dilaporkan' : ' sampai tenggat'}` : 'sekali');
    return `${reminder.smtpAccountName} - ${reminder.enabled ? 'aktif' : 'nonaktif'} - ${schedule}`;
  }
  function reportReminderCells(row) {
    const link = row.reminder;
    if (!link) return '<td>Hubungan SMTP belum dimuat.</td>';
    return `<td><strong>${html(link.state)}</strong><br><small>${html(link.mode === 'global' ? 'Mengikuti tab SMTP' : 'Pengaturan khusus')}</small><br>${html(reminderDescription(link))}<br><small>${html(link.recipients.join(', ') || 'Belum ada email penerima')}</small></td>`;
  }
  function reportCells(data, row) {
    return `<td><strong>${html(data.title)}</strong><br><small>${html(data.notes)}</small></td><td>${html(data.recipient)}<br><small>${html(data.recipientType)}</small></td><td>${html(data.owner)}</td><td>${html(data.dueDate)}${overdue(data) ? '<br><strong class="compliance-overdue">Lewat tenggat</strong>' : ''}</td><td>${html(data.status)}</td>${reportReminderCells(row)}`;
  }
  function reportEvidenceLinks(row) {
    return '<div class="compliance-evidence">' + (row.files || []).map(file => `<a href="/api/compliance/reports/${encodeURIComponent(row.id)}/files/${encodeURIComponent(file.id)}">${html(file.name)}</a>`).join('<br>') + '</div>';
  }
  function contactCells(data) {
    const telephone = data.phone.replace(/[^+\d]/g, '');
    const phone = /^[+\d][\d\s().-]*$/.test(data.phone)
      ? `<a href="tel:${html(telephone)}">${html(data.phone)}</a>` : html(data.phone);
    return `<td><strong>${html(data.name)}</strong></td><td>${html(data.category)}</td><td>${html(data.person)}</td><td>${phone}</td><td>${data.email ? `<a href="mailto:${html(data.email)}">${html(data.email)}</a>` : '—'}</td><td>${html(data.notes)}</td>`;
  }
  for (const config of configurations) {
    const element = suffix => $(config.prefix + suffix);
    const form = element('Form');
    let rows = [], version = 0, ready = false, sharedContext = null, editingRow = null;
    let ownerPicker = null;
    const allowed = action => canPerform(config.key, action);
    function render() {
      element('New').hidden = !allowed('create') || (config.kind === 'reports' && !$('crSmtpPanel').hidden);
      element('New').disabled = !ready;
      const query = element('Search').value.toLocaleLowerCase();
      const filter = config.kind === 'reports' ? element('Filter').value : '';
      const visible = rows.filter(({ data }) => Object.values(data).join(' ').toLocaleLowerCase().includes(query) && (!filter || (filter === 'overdue' ? overdue(data) : data.status === filter)));
      element('Body').innerHTML = visible.map(row => `<tr>${config.kind === 'reports' ? reportCells(row.data, row).replace('</td>', reportEvidenceLinks(row) + '</td>') : contactCells(row.data)}<td>${allowed('update') ? `<button class="button button-quiet" type="button" data-compliance-edit="${html(row.id)}">Ubah</button>` : ''}${allowed('delete') ? `<button class="button button-danger" type="button" data-compliance-delete="${html(row.id)}">Hapus</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="7">${ready ? 'Belum ada data yang sesuai.' : 'Memuat data...'}</td></tr>`;
    }
    async function load() {
      const current = ++version;
      ready = false;
      element('Status').textContent = 'Memuat data...';
      render();
      try {
        const result = await request(config.kind);
        if (current !== version) return;
        rows = result; ready = true; render();
        element('Status').textContent = `${rows.length} ${config.label} tersimpan.`;
        if (config.kind === 'reports') void loadContext();
      } catch (error) {
        if (current !== version) return;
        element('Status').textContent = error.message;
        element('Body').innerHTML = '<tr><td colspan="7">Data gagal dimuat. Klik Muat ulang untuk mencoba kembali.</td></tr>';
      }
    }
    async function loadContext() {
      if (config.kind !== 'reports') return;
      $('complianceReportSettingsLink').hidden = currentUserRole !== 'admin';
      try {
        sharedContext = await request('reports/reminder-context');
        $('complianceReportReminderContext').textContent = 'Pengaturan bersama: ' + reminderDescription(sharedContext);
        updateReminderControls();
      } catch (error) { $('complianceReportReminderContext').textContent = 'Hubungan SMTP gagal dimuat: ' + error.message; }
    }
    function updateReminderControls() {
      if (config.kind !== 'reports') return;
      const shared = form.elements.useGlobalReminder.checked;
      $('complianceReportLocalReminder').hidden = shared;
      form.elements.reminderEmail.required = !shared && form.elements.reminderEnabled.checked;
      form.elements.daysBefore.required = !shared;
      const owner = form.elements.owner.value.trim().toLowerCase();
      const registered = (window.NistReminderRecipients?.registered || []).find(row => row.owner.toLowerCase() === owner);
      const email = form.elements.reminderEmail.value.trim() || registered?.email || (editingRow?.data.owner.toLowerCase() === owner && editingRow?.reminder?.mode === 'global' ? editingRow.reminder.recipients.join(', ') : 'Belum dipetakan; pilih PIC dari register SMTP.');
      $('complianceReportReminderSummary').textContent = shared
        ? 'Mengikuti tab SMTP: ' + (sharedContext ? reminderDescription(sharedContext) : 'memuat akun dan jadwal...') + '. Penerima: ' + (sharedContext?.recipientMode === 'broadcast' ? 'daftar penerima bersama pada tab SMTP' : email)
        : 'Menggunakan akun dan jadwal khusus laporan ini. Pengaturan bersama tidak mengubah jadwal khusus.';
    }
    let smtpVersion = 0;
    async function smtpOptions(selected) {
      const current = ++smtpVersion;
      const select = form.elements.smtpAccountId;
      // Retain the saved account even while loading or when the request fails.
      select.innerHTML = `<option value="${html(selected)}">${html(selected)}</option>`;
      $('complianceSmtpStatus').textContent = 'Memuat akun SMTP...';
      try {
        const accounts = await request('reports/smtp-accounts');
        if (current !== smtpVersion) return;
        select.innerHTML = accounts.map(account => `<option value="${html(account.id)}">${html(account.name)}${account.configured ? '' : ' (belum dikonfigurasi)'}</option>`).join('');
        if (!accounts.some(account => account.id === selected)) select.add(new Option(`${selected} (tidak tersedia)`, selected));
        select.value = selected;
        $('complianceSmtpStatus').textContent = accounts.some(account => account.configured) ? '' : 'SMTP belum dikonfigurasi. Atur koneksi SMTP agar reminder dapat dikirim.';
      } catch (error) { if (current === smtpVersion) $('complianceSmtpStatus').textContent = error.message; }
    }
    function updateFileControls() {
      if (config.kind !== 'reports') return;
      const completed = form.elements.status.value === 'Sudah dilaporkan';
      form.elements.files.disabled = !completed;
      if (!completed) form.elements.files.value = '';
    }
    function openForm(row) {
      if (!allowed(row ? 'update' : 'create')) return;
      form.reset();
      editingRow = row || null;
      if (config.kind === 'reports' && row) form.elements.useGlobalReminder.checked = row.data.useGlobalReminder === true;
      form.elements.id.value = row?.id || '';
      element('FormTitle').textContent = `${row ? 'Ubah' : 'Tambah'} ${config.label}`;
      element('FormStatus').textContent = '';
      for (const [key, value] of Object.entries(row?.data || {})) {
        const input = form.elements.namedItem(key);
        if (!input || key === 'smtpAccountId') continue;
        if (input.type === 'checkbox') input.checked = value === true;
        else input.value = value;
      }
      if (config.kind === 'reports') {
        updateFileControls();
        updateReminderControls();
        void loadContext();
        $('complianceReportExistingFiles').innerHTML = (row?.files || []).map(file => `<div class="toolbar"><a href="/api/compliance/reports/${encodeURIComponent(row.id)}/files/${encodeURIComponent(file.id)}">${html(file.name)}</a><small>${Math.ceil(file.size / 1024)} KB</small>${allowed('delete') ? `<button class="button button-danger" type="button" data-report-remove-file="${html(file.id)}">Hapus bukti</button>` : ''}</div>`).join('');
        form.elements.reminderEmail.required = form.elements.reminderEnabled.checked && !form.elements.useGlobalReminder.checked;
        void smtpOptions(row?.data.smtpAccountId || 'default');
      }
      element('Modal').showModal();
    }
    document.querySelector(`[data-view="${config.key}"]`).addEventListener('click', () => {
      if (!allowed('read')) return;
      document.querySelectorAll('.view').forEach(view => view.classList.toggle('active-view', view.id === config.view));
      document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === config.key));
      saveUiState(config.key);
      void load();
    });
    if (config.kind === 'reports') $('complianceReportExistingFiles').addEventListener('click', async event => {
      const button = event.target.closest('[data-report-remove-file]');
      if (!button || !allowed('delete') || !confirm('Hapus file bukti pelaporan ini?')) return;
      button.disabled = true;
      try { await request(`reports/${encodeURIComponent(form.elements.id.value)}/files/${encodeURIComponent(button.dataset.reportRemoveFile)}`, { method: 'DELETE' }); button.closest('.toolbar').remove(); await load(); }
      catch (error) { element('FormStatus').textContent = error.message; button.disabled = false; }
    });
    element('New').addEventListener('click', () => openForm());
    element('Cancel').addEventListener('click', () => element('Modal').close());
    element('Refresh').addEventListener('click', load);
    element('Search').addEventListener('input', render);
    if (config.kind === 'reports') {
      element('Filter').addEventListener('change', render);
      form.elements.status.addEventListener('change', updateFileControls);
      form.elements.useGlobalReminder.addEventListener('change', updateReminderControls);
      form.elements.owner.addEventListener('input', updateReminderControls);
      form.elements.reminderEmail.addEventListener('input', updateReminderControls);
      $('complianceReportSettingsLink').addEventListener('click', () => $('crSmtpTab').click());
      ownerPicker = window.NistReminderRecipients.mount($('complianceReportOwnerPicker'), row => {
        form.elements.owner.value = row.owner;
        form.elements.reminderEmail.value = form.elements.useGlobalReminder.checked ? '' : row.email;
        updateReminderControls();
      });

      window.addEventListener('compliance-reminder-settings-saved', () => { if ($(config.view).classList.contains('active-view')) void load(); else ready = false; });
      window.addEventListener('reminder-recipient-register-updated', () => { if ($(config.view).classList.contains('active-view')) void load(); else ready = false; updateReminderControls(); });
      form.elements.continueOverdue.addEventListener('change', () => { if (form.elements.continueOverdue.checked) form.elements.repeatDaily.checked = true; });
      form.elements.repeatDaily.addEventListener('change', () => { if (!form.elements.repeatDaily.checked) form.elements.continueOverdue.checked = false; });
      form.elements.reminderEnabled.addEventListener('change', () => { form.elements.reminderEmail.required = form.elements.reminderEnabled.checked && !form.elements.useGlobalReminder.checked; });
    }
    form.addEventListener('submit', guardFormSubmission(async event => {
      event.preventDefault();
      const id = form.elements.id.value;
      if (!allowed(id ? 'update' : 'create')) return;
      const data = Object.fromEntries(new FormData(form));
      delete data.id;
      delete data.files;
      if (config.kind === 'reports') {
        data.daysBefore = Number(data.daysBefore);
        data.useGlobalReminder = form.elements.useGlobalReminder.checked;
        data.reminderEnabled = form.elements.reminderEnabled.checked;
        data.repeatDaily = form.elements.repeatDaily.checked;
        data.continueOverdue = form.elements.continueOverdue.checked;
      }
      try {
        let options = { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
        if (config.kind === 'reports') {
          const payload = new FormData(); payload.append('data', JSON.stringify(data));
          for (const file of form.elements.files.files) payload.append('files', file);
          options = { method: id ? 'PUT' : 'POST', body: payload };
        }
        await request(config.kind + (id ? `/${encodeURIComponent(id)}` : ''), options);
        element('Modal').close();
        await load();
      } catch (error) { element('FormStatus').textContent = error.message; }
    }));
    element('Body').addEventListener('click', async event => {
      const button = event.target.closest('[data-compliance-edit],[data-compliance-delete]');
      if (!button) return;
      const row = rows.find(item => item.id === (button.dataset.complianceEdit || button.dataset.complianceDelete));
      if (!row) return;
      if (button.dataset.complianceEdit) return openForm(row);
      if (!allowed('delete') || !confirm(`Hapus ${config.label} "${row.data.title || row.data.name}"?`)) return;
      button.disabled = true;
      try { await request(`${config.kind}/${encodeURIComponent(row.id)}`, { method: 'DELETE' }); await load(); }
      catch (error) { element('Status').textContent = error.message; button.disabled = false; }
    });
  }
})();
