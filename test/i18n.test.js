const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(saved, storageUnavailable = false) {
  const values = new Map([['nist-basis-language', saved]]);
  const context = {
    localStorage: {
      getItem(key) { if (storageUnavailable) throw new Error('blocked'); return values.get(key); },
      setItem(key, value) { if (storageUnavailable) throw new Error('blocked'); values.set(key, value); }
    },
    dispatchEvent() {}, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  };
  vm.runInNewContext(fs.readFileSync('frontend/public/i18n.js', 'utf8'), context);
  return { i18n: context.NistI18n, values };
}

test('language persists and translates both original languages while preserving unknown content', () => {
  const { i18n, values } = load('en');
  assert.equal(i18n.t('Masukkan username'), 'Enter your username');
  assert.equal(i18n.t('  Simpan  '), '  Save  ');
  assert.equal(i18n.t('PT Contoh / risk-123'), 'PT Contoh / risk-123');
  i18n.setLanguage('id');
  assert.equal(i18n.t('Choose framework'), 'Pilih kerangka kerja');
  assert.equal(i18n.t('SAVE'), 'SIMPAN');
  assert.equal(values.get('nist-basis-language'), 'id');
  i18n.setLanguage('fr');
  assert.equal(i18n.language, 'id');
});

test('blocked storage and invalid saved preferences fall back to Indonesian', () => {
  assert.equal(load('fr').i18n.language, 'id');
  const { i18n } = load('en', true);
  assert.equal(i18n.language, 'id');
  i18n.setLanguage('en');
  assert.equal(i18n.t('Batal'), 'Cancel');
});

test('all feature groups share bilingual labels, statuses and dynamic counts', () => {
  const { i18n } = load('id');
  const samples = [
    ['Create CSF control', 'Buat kontrol CSF'],
    ['Create Privacy control', 'Buat kontrol privasi'],
    ['Create ISO 27001 requirement', 'Buat persyaratan ISO 27001'],
    ['Create SOA control', 'Buat kontrol SOA'],
    ['Save risk acceptance form', 'Simpan formulir penerimaan risiko'],
    ['Vendor Risk Tiering Matrix', 'Matriks Tingkat Risiko Vendor'],
    ['Vendor Due Diligence Questionnaire', 'Kuesioner Uji Tuntas Vendor'],
    ['Certification details', 'Detail sertifikasi'],
    ['User access matrix', 'Matriks akses pengguna'],
    ['Save diagram', 'Simpan diagram'],
    ['New note title', 'Judul catatan baru'],
    ['Send test email', 'Kirim email percobaan'],
    ['Create file backup', 'Buat cadangan file'],
    ['Restore files', 'Pulihkan file'],
    ['12 files found', '12 file ditemukan'],
    ['24 policies', '24 kebijakan'],
    ['3. Account Management', '3. Manajemen Akun'],
    ['Tier 1 (High)', 'Tingkat 1 (Tinggi)'],
    ['Within 48 hours', 'Dalam 48 jam'],
    ['75% completion', '75% penyelesaian'],
    ['Save failed', 'Gagal menyimpan'],
    ['Discard unsaved note changes?', 'Abaikan perubahan catatan yang belum disimpan?']
  ];
  for (const [en, id] of samples) assert.equal(i18n.t(en), id, en);
  i18n.setLanguage('en');
  for (const [en, id] of samples) assert.equal(i18n.t(id), en, id);
  assert.equal(i18n.t(null), null);
});

test('native dialogs translate their message while preserving prompt defaults and return values', () => {
  const calls = [];
  const context = {
    alert: (...args) => calls.push(args),
    confirm: (...args) => { calls.push(args); return false; },
    prompt: (...args) => { calls.push(args); return 'user value'; },
    dispatchEvent() {}, CustomEvent: class {}
  };
  vm.runInNewContext(fs.readFileSync('frontend/public/i18n.js', 'utf8'), context);
  assert.equal(context.confirm('Delete this template?'), false);
  assert.equal(context.prompt('New note title', 'Save'), 'user value');
  assert.deepEqual(calls, [['Hapus template ini?'], ['Judul catatan baru', 'Save']]);
});

test('dashboard counters, maturity levels, recommendations and tooltips switch in both directions', () => {
  const { i18n } = load('id');
  const samples = [
    ['17 of 106 controls scored', '17 dari 106 kontrol telah dinilai'],
    ['GV / 31 controls', 'GV / 31 kontrol'],
    ['5 Optimized', '5 Optimal'],
    ['Govern · Needs assessment', 'Tata Kelola · Perlu penilaian'],
    ['Inventory and Mapping (ID.IM-P)', 'Inventarisasi dan Pemetaan (ID.IM-P)'],
    ['Policy: 3.5', 'Kebijakan: 3.5'],
    ['Overall Average Score', 'Skor rata-rata keseluruhan']
  ];
  for (const [english, indonesian] of samples) assert.equal(i18n.t(english), indonesian);
  i18n.setLanguage('en');
  for (const [english, indonesian] of samples) assert.equal(i18n.t(indonesian), english);
  assert.equal(i18n.t('Mulai assessment'), 'Start assessment');
});

test('CSF and privacy canvas labels use the current language without changing scores', () => {
  const { i18n } = load('id');
  const labels = [];
  const context = new Proxy({ fillText(label) { labels.push(label); } }, { get(target, key) { return target[key] || (() => {}); } });
  const canvas = { getBoundingClientRect: () => ({ width: 700 }), style: {}, getContext: () => context };
  const sandbox = {
    window: { devicePixelRatio: 1, NistI18n: i18n },
    $: () => canvas, document: { querySelectorAll: () => [] },
    categorySummary: () => [], privacyRows: [{ category: 'Inventory and Mapping (ID.IM-P)' }],
    privacyScoreFor: () => 2
  };
  vm.createContext(sandbox);
  for (const file of ['assessment/overview-and-csf.js', 'privacy/assessment.js']) {
    vm.runInContext(fs.readFileSync(`frontend/client/src/workspace/features/${file}`, 'utf8'), sandbox);
  }
  sandbox.renderRadar();
  assert.ok(labels.includes('Skor rata-rata keseluruhan'));
  sandbox.renderPrivacyRadar();
  assert.ok(labels.includes('Inventarisasi dan Pemeta'));
  assert.equal(canvas.radarPoints[0].target, 3);
  i18n.setLanguage('en'); labels.length = 0;
  sandbox.renderRadar(); sandbox.renderPrivacyRadar();
  assert.ok(labels.includes('Overall Average Score'));
  assert.ok(labels.includes('Inventory and Mapping'));
});


test('asset workspace labels, CIA matrix and dynamic notices follow the selected language', () => {
  const { i18n } = load('en');
  const samples = [
    ['Rak Server', 'Server Racks'],
    ['Modelling Asset Register', 'Modelling Asset Register'],
    ['Assessment risiko aset (CIA)', 'Asset risk assessment (CIA)'],
    ['Referensi change/tiket (opsional)', 'Change/ticket reference (optional)'],
    ['Sangat rendah (1)', 'Very low (1)'],
    ['High (25)', 'High (25)'],
    ['3 / 10 aset', '3 / 10 assets'],
    ['Dampak 4 x kemungkinan 3 = 12', 'Impact 4 x likelihood 3 = 12'],
    ['Risiko otomatis: Medium - Dampak 4 x kemungkinan 3 = 12', 'Automatic risk: Medium - Impact 4 x likelihood 3 = 12'],
    ['Skor 12 / 25', 'Score 12 / 25'],
    ['Perangkat terpasang (4)', 'Installed devices (4)'],
    ['Aset sudah dipakai: Terpasang di rakGTI (U24-U25). Gunakan Ubah posisi atau drag-and-drop untuk memindahkannya.', 'Device already in use: Installed in rakGTI (U24-U25). Use Edit position or drag and drop to move it.'],
    ['Lewat 3 hari', 'Overdue by 3 days'],
    ['Tambah aset', 'Add asset'],
    ['planned', 'planned'],
    ['connects-to', 'connects-to']
  ];
  for (const [id, en] of samples) assert.equal(i18n.t(id), en, id);
  i18n.setLanguage('id');
  assert.equal(i18n.t('Asset Register'), 'Register Aset');
  assert.equal(i18n.t('Related risk'), 'Risiko terkait');
  assert.equal(i18n.t('planned'), 'Direncanakan');
  assert.equal(i18n.t('Medium (12)'), 'Sedang (12)');
  assert.equal(i18n.t('Server Racks'), 'Rak Server');
  assert.equal(i18n.t('Device already in use: Installed in rakGTI (U24-U25). Use Edit position or drag and drop to move it.'), samples[11][0]);
  assert.equal(i18n.t('Firewall(GTI Ragunan)'), 'Firewall(GTI Ragunan)');
});
