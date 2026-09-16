async function policySmtpRequest(method, suffix = '', payload) {
  const response = await fetch(`/api/policy-register/reminder-settings${suffix}`, { method, headers: { 'Content-Type': 'application/json' }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Pengaturan SMTP gagal diproses.');
  return data;
}
function previewPolicySmtp() {
  const values = { title: 'Kebijakan Keamanan Informasi (contoh)', owner: 'CISO', lastReview: '2026-01-15', reviewCycle: 'Annual', dueDate: '2027-01-15' };
  const render = value => value.replace(/{{(\w+)}}/g, (match, name) => values[name] ?? match);
  $('policySmtpPreviewSubject').textContent = render($('policySmtpSubject').value);
  $('policySmtpPreviewBody').textContent = render($('policySmtpBody').value);
}
$('policySmtpSubject').addEventListener('input', previewPolicySmtp);
$('policySmtpBody').addEventListener('input', previewPolicySmtp);
function populatePolicySmtp(data) {
  $('policySmtpSubject').value = data.subjectTemplate || '';
  $('policySmtpBody').value = data.bodyTemplate || '';
  previewPolicySmtp();
  $('policySmtpDays').value = data.daysBefore;
  $('policySmtpEnabled').checked = data.enabled;
  $('policySmtpOwners').value = data.owners.map(row => `${row.owner} = ${row.email}`).join('\n');
  $('policyReminderConnectionStatus').textContent = data.smtpConfigured ? 'SMTP terpusat sudah dikonfigurasi. Reminder menggunakan koneksi email organisasi.' : 'SMTP belum dikonfigurasi. Buka pengaturan SMTP sebelum mengaktifkan reminder.';
}
$('policySmtpOpen').addEventListener('click', async () => {
  if (currentUserRole !== 'admin') return;
  $('policySmtpStatus').textContent = 'Memuat pengaturan...';
  const controls = [...$('policySmtpForm').elements];
  controls.forEach(control => { control.disabled = true; });
  try { populatePolicySmtp(await policySmtpRequest('GET')); $('policySmtpStatus').textContent = 'Pengaturan siap diedit.'; controls.forEach(control => { control.disabled = false; }); }
  catch (error) { $('policySmtpStatus').textContent = `${error.message} Klik tab pengaturan untuk mencoba kembali.`; }
});
$('policySmtpForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  if (button) { button.disabled = true; button.textContent = 'Menyimpan pengaturan...'; }
  $('policySmtpStatus').textContent = 'Menyimpan...';
  try {
    const owners = $('policySmtpOwners').value.split('\n').filter(line => line.trim()).map(line => {
      const index = line.lastIndexOf('=');
      if (index < 1) throw new Error('Format penerima harus Owner = email.');
      return { owner: line.slice(0, index).trim(), email: line.slice(index + 1).trim() };
    });
    const data = await policySmtpRequest('PUT', '', { enabled: $('policySmtpEnabled').checked, daysBefore: Number($('policySmtpDays').value), subjectTemplate: $('policySmtpSubject').value, bodyTemplate: $('policySmtpBody').value, owners });
    populatePolicySmtp(data);
    $('policySmtpStatus').textContent = data.enabled ? 'Pengaturan tersimpan. Reminder otomatis aktif; jadwal review diperiksa paling lambat satu jam lagi.' : 'Pengaturan tersimpan. Reminder otomatis nonaktif. Anda tetap dapat mengirim email percobaan.';
  } catch (error) { $('policySmtpStatus').textContent = error.message; }
  finally { if (button) { button.disabled = false; button.textContent = 'Simpan reminder kebijakan'; } }
});
$('policySmtpTest').addEventListener('click', async () => {
  const input = $('policySmtpTestTo');
  if (!input.value || !input.checkValidity()) { $('policySmtpStatus').textContent = 'Isi email tujuan tes yang valid.'; return; }
  $('policySmtpTest').disabled = true;
  $('policySmtpTest').textContent = 'Mengirim email percobaan...';
  $('policySmtpStatus').textContent = 'Mengirim email tes...';
  try { const result = await policySmtpRequest('POST', '/test', { to: input.value.trim() }); $('policySmtpStatus').textContent = result.message; }
  catch (error) { $('policySmtpStatus').textContent = error.message; }
  finally { $('policySmtpTest').disabled = false; $('policySmtpTest').textContent = 'Kirim email percobaan'; }
});

