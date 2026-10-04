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
