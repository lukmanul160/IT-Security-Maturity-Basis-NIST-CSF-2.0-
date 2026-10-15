;(() => {
  async function request(path, options = {}) {
    const response = await fetch('/api/compliance/reports' + path, { cache: 'no-store', signal: AbortSignal.timeout(30000), ...options });
    const result = await response.json().catch(() => null);
    if (response.status === 404) throw new Error('API reminder belum tersedia di backend. Rebuild dan restart container aplikasi, lalu coba muat lagi.');
    if (response.status === 403) throw new Error('Pengaturan reminder hanya dapat dikelola administrator.');
    if (!response.ok || !result) throw new Error(result?.error || 'Pengaturan reminder gagal dimuat dari server.');
    return result;
  }
  const reminderControls = () => [...$('crReminderForm').elements, $('crReminderTest')].filter(control => control.id !== 'crReminderUseTemplate');
  const reminderTemplateFallback = {
    subjectTemplate: 'Pengingat pelaporan: {{reportTitle}}',
    bodyTemplate: 'Yth. {{owner}},\n\nMohon menyiapkan pelaporan berikut:\nLaporan: {{reportTitle}}\nTujuan: {{recipient}}\nTenggat: {{dueDate}}\nStatus: {{status}}\n\n{{description}}\n\nSetelah dikirim, ubah status menjadi Sudah dilaporkan di Reporting Regulator.'
  };
  let reminderTemplateExample = reminderTemplateFallback;
  let loading = false, loaded = false;
  function previewReminder() {
    const values = { recipient: 'Regulator (contoh)', reportTitle: 'Laporan berkala (contoh)', owner: 'PIC Compliance', status: 'Belum dilaporkan', dueDate: '2026-12-31', description: 'Siapkan laporan dan perbarui status setelah dikirim.' };
    const render = value => value.replace(/{{(\w+)}}/g, (match, name) => values[name] ?? match);
    $('crReminderPreviewSubject').textContent = render($('crReminderSubject').value).replace(/[\r\n]/g, ' ');
    $('crReminderPreviewBody').textContent = render($('crReminderBody').value);
  }
  $('crReminderSubject').addEventListener('input', previewReminder);
  $('crReminderBody').addEventListener('input', previewReminder);
  $('crReminderUseTemplate').addEventListener('click', () => {
    if (currentUserRole !== 'admin') return;
    $('crReminderSubject').value = reminderTemplateExample.subjectTemplate;
    $('crReminderBody').value = reminderTemplateExample.bodyTemplate;
    previewReminder();
    $('crReminderStatus').textContent = 'Template standar diterapkan pada formulir. Periksa pratinjau, lalu klik Simpan reminder untuk menyimpan.';
  });
  function populateReminder(data) {
    populateSmtpAccountOptions('crReminderAccount', data.smtpAccounts || [], data.smtpAccountId);
    reminderTemplateExample = typeof data.templateExample?.subjectTemplate === 'string' && typeof data.templateExample?.bodyTemplate === 'string' ? data.templateExample : reminderTemplateFallback;

    $('crReminderSubject').value = data.subjectTemplate || $('crReminderSubject').value || reminderTemplateExample.subjectTemplate;
    $('crReminderBody').value = data.bodyTemplate || $('crReminderBody').value || reminderTemplateExample.bodyTemplate;
    previewReminder();
    $('crReminderEnabled').checked = data.enabled;
    $('crReminderDays').value = data.daysBefore;
    $('crReminderStartUnit').value = data.startUnit ?? 'days';
    $('crReminderRepeatEvery').value = data.repeatEvery ?? 1;
    $('crReminderRepeatUnit').value = data.repeatUnit ?? 'days';
    $('crReminderRepeatDaily').checked = data.repeatDaily === true;
    $('crReminderMaxDeliveries').value = data.maxDeliveries ?? 366;
    $('crReminderUnlimited').checked = data.unlimited === true;
    $('crReminderContinueOverdue').checked = data.continueOverdue === true;
    window.NistReminderSchedule?.refresh('crReminder');
    $('crReminderRecipients').value = (data.recipients||[]).join('\n');
    $('crReminderOwners').value=(data.owners||[]).map(item=>`${item.owner} = ${item.email}`).join('\n');
  $('crReminderOwners').dispatchEvent(new Event('recipients-populated'));
    $('crReminderRecipientMode').value=data.recipientMode||'owners';
    $('crReminderBroadcastField').hidden=$('crReminderRecipientMode').value!=='broadcast';
    $('crReminderConnection').textContent = data.smtpConfigured ? 'Akun SMTP tersimpan sudah dikonfigurasi.' : 'SMTP Admin belum dikonfigurasi. Lengkapi koneksi sebelum mengaktifkan reminder.';
  }
  async function loadReminder() {
    if (currentUserRole !== 'admin' || loading) return;
    loading = true; loaded = false;
    reminderControls().forEach(control => { control.disabled = true; });
    $('crReminderStatus').textContent = 'Memuat pengaturan...';
    $('crReminderLoadStatus').textContent = 'Memuat pengaturan. Kontrol akan aktif setelah data tersimpan berhasil dimuat.';
    $('crReminderRetry').hidden = true;
    try {
      populateReminder(await request('/reminder-settings'));
      reminderControls().forEach(control => { control.disabled = false; });
      window.NistReminderSchedule.refresh('crReminder');
      loaded = true;
      $('crReminderStatus').textContent = 'Pengaturan siap diedit.';
      $('crReminderLoadStatus').textContent = 'Pengaturan siap diedit. Pilih nama pada daftar penerima untuk menambahkan pemetaan.';
    } catch (error) {
      const message = error.name === 'TimeoutError' ? 'Server terlalu lama merespons. Klik Coba muat pengaturan lagi.' : error.message;
      $('crReminderStatus').textContent = message;
      $('crReminderLoadStatus').textContent = 'Kontrol terkunci karena pengaturan belum berhasil dimuat. ' + message;
      $('crReminderRetry').hidden = false;
      $('crReminderReload').disabled = false;
    } finally { loading = false; }
  }
  $('crReminderRetry').addEventListener('click', loadReminder);
  $('crReminderRecipientMode').addEventListener('change',()=>{$('crReminderBroadcastField').hidden=$('crReminderRecipientMode').value!=='broadcast';});
  $('crReminderReload').addEventListener('click', loadReminder);
  $('crReminderSmtp').addEventListener('click', () => { $('crSmtpForm').scrollIntoView({behavior:'smooth',block:'center'}); $('crSmtpForm').elements.host.focus({preventScroll:true}); });
  $('crReminderForm').addEventListener('submit', guardFormSubmission(async event => {
    event.preventDefault();
    if (currentUserRole !== 'admin' || !loaded || loading) return;
    $('crReminderSave').disabled = true;
    try {
      const data = await request('/reminder-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ smtpAccountId: $('crReminderAccount').value, subjectTemplate: $('crReminderSubject').value, bodyTemplate: $('crReminderBody').value, enabled: $('crReminderEnabled').checked, daysBefore: Number($('crReminderDays').value), startUnit: $('crReminderStartUnit').value, repeatEvery: Number($('crReminderRepeatEvery').value), repeatUnit: $('crReminderRepeatUnit').value, repeatDaily: $('crReminderRepeatDaily').checked, maxDeliveries: Number($('crReminderMaxDeliveries').value), unlimited: $('crReminderUnlimited').checked, continueOverdue: $('crReminderContinueOverdue').checked, recipientMode:$('crReminderRecipientMode').value,owners:$('crReminderOwners').value.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>{const index=line.lastIndexOf('=');return {owner: index<0?'':line.slice(0,index).trim(),email:index<0?line:line.slice(index+1).trim()};}), recipients: $('crReminderRecipients').value.split('\n').map(to => to.trim()).filter(Boolean) }) });
      populateReminder(data);
      window.dispatchEvent(new Event('compliance-reminder-settings-saved'));
      if (!data.subjectTemplate || !data.bodyTemplate) {
        $('crReminderStatus').textContent = 'Isi template tetap ditampilkan, tetapi server belum mengonfirmasi penyimpanannya. Restart server aplikasi untuk memuat pembaruan, lalu simpan kembali.';
        return;
      }
      $('crReminderStatus').textContent = data.enabled ? 'Reminder tersimpan dan aktif. Jadwal diperiksa paling lambat satu jam lagi.' : 'Pengaturan tersimpan. Reminder otomatis nonaktif.';
    } catch (error) { $('crReminderStatus').textContent = error.message; }
    finally { $('crReminderSave').disabled = false; }
  }));
  $('crReminderTest').addEventListener('click', async () => {
    const input = $('crReminderTestTo');
    if (!input.value || !input.reportValidity()) { $('crReminderStatus').textContent = 'Isi email tujuan percobaan yang valid.'; return; }
    $('crReminderTest').disabled = true; $('crReminderStatus').textContent = 'Mengirim email percobaan...';
    try { $('crReminderStatus').textContent = (await request('/reminder-settings/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: input.value.trim() }) })).message; }
    catch (error) { $('crReminderStatus').textContent = error.message; }
    finally { $('crReminderTest').disabled = false; }
  });

  $('crSmtpTab').addEventListener('click', () => { if (currentUserRole === 'admin') void loadReminder(); });
  window.addEventListener('compliance-smtp-account-saved', event => {
    if (!loaded || currentUserRole !== 'admin') return;
    const account = event.detail;
    const select = $('crReminderAccount');
    if (![...select.options].some(option => option.value === account.id)) select.add(new Option(account.name, account.id));
    select.value = account.id;
    $('crReminderConnection').textContent = 'Akun koneksi yang baru disimpan dipilih untuk reminder. Klik Simpan reminder agar dipakai oleh daftar pelaporan.';
    $('crReminderStatus').textContent = 'Pilihan akun berubah pada formulir; belum diterapkan sampai Simpan reminder.';
  });
  $('crReminderContinueOverdue').addEventListener('change', () => {
    if ($('crReminderContinueOverdue').checked) $('crReminderRepeatDaily').checked = true;
    window.NistReminderSchedule.refresh('crReminder');
  });
  $('crReminderRepeatDaily').addEventListener('change', () => {
    if (!$('crReminderRepeatDaily').checked) $('crReminderContinueOverdue').checked = false;
    window.NistReminderSchedule.refresh('crReminder');
  });
})();
