const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initializeData } = require('../scripts/docker-start');

test('upgrade adds IKAS files to an old data volume without replacing existing data', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nist-docker-data-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const defaults = path.join(root, 'defaults');
  const volume = path.join(root, 'volume');
  fs.mkdirSync(defaults);
  fs.mkdirSync(volume);
  fs.writeFileSync(path.join(defaults, 'ikas-data.json'), '{"framework":"ikas"}');
  const workbook = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
  fs.writeFileSync(path.join(defaults, 'ikas-template.xlsx'), workbook);
  fs.writeFileSync(path.join(defaults, 'csf-data.json'), 'new default');
  fs.writeFileSync(path.join(volume, 'csf-data.json'), 'existing data');
  fs.writeFileSync(path.join(volume, 'assessment.json'), 'user assessment');
  assert.deepEqual(initializeData(defaults, volume).sort(), ['ikas-data.json', 'ikas-template.xlsx']);
  assert.equal(fs.readFileSync(path.join(volume, 'csf-data.json'), 'utf8'), 'existing data');
  assert.equal(fs.readFileSync(path.join(volume, 'assessment.json'), 'utf8'), 'user assessment');
  assert.deepEqual(fs.readFileSync(path.join(volume, 'ikas-template.xlsx')), workbook);
  assert.deepEqual(initializeData(defaults, volume), []);
});

test('fresh data directory receives bundled defaults; missing defaults fail visibly', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nist-docker-data-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const defaults = path.join(root, 'defaults');
  fs.mkdirSync(defaults);
  fs.writeFileSync(path.join(defaults, 'ikas-data.json'), '{}');
  assert.deepEqual(initializeData(defaults, path.join(root, 'fresh')), ['ikas-data.json']);
  assert.throws(() => initializeData(path.join(root, 'missing'), path.join(root, 'fresh')), { code: 'ENOENT' });
});
