// Reporting SMTP tab uses the existing centralized, admin-only SMTP API.
;(() => {
  const form = $('crSmtpForm');
  let accounts = [], selected = 'default', busy = false, ready = false;
  const status = message => { $('crSmtpStatus').textContent = message; };
  function controls() {
    const disabled = busy || !ready || currentUserRole !== 'admin';
    for (const control of form.elements) control.disabled = disabled;
    for (const id of ['crSmtpAccount', 'crSmtpAdd', 'crSmtpTest', 'crSmtpTestTo']) $(id).disabled = disabled;
    $('crSmtpReload').disabled = busy;
    $('crSmtpTest').disabled = disabled || !selected;
  }
  async function request(method, suffix, payload) {
    const response = await fetch(`/api/smtp-settings${suffix}`, {
      method, cache: 'no-store', headers: { 'Content-Type': 'application/json' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Pengaturan SMTP gagal diproses.');
    return result;
  }
  function populate(data) {
    form.reset();
    for (const field of ['name', 'host', 'port', 'security', 'username', 'from']) form.elements[field].value = data[field] ?? '';
    form.elements.password.placeholder = data.hasPassword ? 'Kosongkan untuk mempertahankan password tersimpan' : 'Belum ada password tersimpan';
  }
  async function load(preferred = selected || 'default') {
    if (busy || currentUserRole !== 'admin') return;
    busy = true; controls(); status('Memuat akun SMTP...');
    try {
      accounts = await request('GET', '/accounts');
      $('crSmtpAccount').replaceChildren(...accounts.map(account => new Option(`${account.name}${account.configured ? '' : ' (belum dikonfigurasi)'}`, account.id)));
      selected = accounts.some(account => account.id === preferred) ? preferred : 'default';
      $('crSmtpAccount').value = selected;
      populate(accounts.find(account => account.id === selected));
      ready = true; status('Pengaturan siap diedit.');
    } catch (error) { ready = false; status(error.message); }
    finally { busy = false; controls(); }
  }
  function setTab(tab) {
    const smtp = tab === 'smtp';
    $('crReportsPanel').hidden = smtp;
    $('crSmtpPanel').hidden = !smtp;
    $('complianceReportNew').hidden = smtp || !canPerform('reporting-regulator', 'create');
    document.querySelectorAll('[data-cr-tab]').forEach(button => {
      const active = button.dataset.crTab === tab;
      button.classList.toggle('button-accent', active);
      button.classList.toggle('button-quiet', !active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    $('crSmtpAdmin').hidden = currentUserRole !== 'admin';
    $('crSmtpAccess').hidden = currentUserRole === 'admin';
    if (smtp) void load();
  }
  const tabs = [...document.querySelectorAll('[data-cr-tab]')];
  tabs.forEach((button, index) => {
    button.addEventListener('click', () => setTab(button.dataset.crTab));
    button.addEventListener('keydown', event => {
      const target = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault(); tabs[target].focus(); tabs[target].click();
    });
  });
  document.querySelector('[data-view="reporting-regulator"]').addEventListener('click', () => setTab('reports'));
  $('crSmtpReload').addEventListener('click', () => load());
  $('crSmtpAccount').addEventListener('change', () => {
    selected = $('crSmtpAccount').value;
    populate(accounts.find(account => account.id === selected));
    status('Akun dipilih.'); controls();
  });
  $('crSmtpAdd').addEventListener('click', () => {
    if (busy || !ready || currentUserRole !== 'admin') return;
    selected = null; $('crSmtpAccount').value = '';
    populate({ name: '', host: '', port: 587, security: 'starttls', username: '', from: '' });
    controls(); form.elements.name.focus(); status('Isi koneksi lalu simpan untuk membuat akun SMTP baru.');
  });
  form.addEventListener('submit', guardFormSubmission(async event => {
    event.preventDefault();
    if (busy || !ready || currentUserRole !== 'admin') return;
    const payload = Object.fromEntries(new FormData(form));
    payload.port = Number(payload.port); payload.clearPassword = form.elements.clearPassword.checked;
    busy = true; controls(); status('Menyimpan akun SMTP...');
    let savedId;
    try {
      const result = await request(selected ? 'PUT' : 'POST', selected ? `/accounts/${encodeURIComponent(selected)}` : '/accounts', payload);
      savedId = result.id || selected;
      // Never leave credentials in the form after a successful save.
      form.elements.password.value = '';
      form.elements.clearPassword.checked = false;
    } catch (error) { status(error.message); }
    finally { busy = false; controls(); }
    if (savedId) {
      await load(savedId);
      if (ready) {
        status('Akun SMTP tersimpan. Klik Simpan reminder di atas untuk menghubungkan akun ini dengan jadwal bersama daftar pelaporan.');
        window.dispatchEvent(new CustomEvent('compliance-smtp-account-saved', { detail: accounts.find(account => account.id === savedId) }));
      }
    }
  }));
  $('crSmtpTest').addEventListener('click', async () => {
    if (busy || !ready || !selected || currentUserRole !== 'admin') return;
    const input = $('crSmtpTestTo');
    if (!input.value.trim() || !input.reportValidity()) { status('Isi email tujuan percobaan yang valid.'); return; }
    const to = input.value.trim();
    busy = true; controls(); status('Mengirim email percobaan...');
    try { status((await request('POST', '/test', { to, smtpAccountId: selected })).message); }
    catch (error) { status(error.message); }
    finally { busy = false; controls(); }
  });
})();
