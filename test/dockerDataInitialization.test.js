const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initializeData } = require('../scripts/docker-start');

test('upgrade adds IKAS and maturity templates to an old data volume without replacing existing data', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nist-docker-data-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const defaults = path.join(root, 'defaults');
  const volume = path.join(root, 'volume');
  fs.mkdirSync(defaults);
  fs.mkdirSync(volume);
  fs.writeFileSync(path.join(defaults, 'ikas-data.json'), '{"framework":"ikas"}');
  const workbook = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
  fs.writeFileSync(path.join(defaults, 'ikas-template.xlsx'), workbook);
  fs.writeFileSync(path.join(defaults, 'maturity-template.xlsx'), workbook);
  fs.writeFileSync(path.join(defaults, 'csf-data.json'), 'new default');
  fs.writeFileSync(path.join(volume, 'csf-data.json'), 'existing data');
  fs.writeFileSync(path.join(volume, 'assessment.json'), 'user assessment');
  assert.deepEqual(initializeData(defaults, volume).sort(), ['ikas-data.json', 'ikas-template.xlsx', 'maturity-template.xlsx']);
  assert.equal(fs.readFileSync(path.join(volume, 'csf-data.json'), 'utf8'), 'existing data');
  assert.equal(fs.readFileSync(path.join(volume, 'assessment.json'), 'utf8'), 'user assessment');
  assert.deepEqual(fs.readFileSync(path.join(volume, 'ikas-template.xlsx')), workbook);
  assert.deepEqual(fs.readFileSync(path.join(volume, 'maturity-template.xlsx')), workbook);
  fs.writeFileSync(path.join(volume, 'maturity-template.xlsx'), 'existing workbook');
  assert.deepEqual(initializeData(defaults, volume), []);
  assert.equal(fs.readFileSync(path.join(volume, 'maturity-template.xlsx'),'utf8'), 'existing workbook');
});

test('Docker runtime data COPY sources exist and are explicitly included in the build context', () => {
  const dockerfile=fs.readFileSync(path.join(__dirname,'../Dockerfile'),'utf8');
  const ignore=fs.readFileSync(path.join(__dirname,'../.dockerignore'),'utf8').split(/\r?\n/).map(line=>line.trim());
  const sources=[...dockerfile.matchAll(/\bdata\/[\w.-]+\.(?:json|xlsx)\b/g)].map(match=>match[0]);
  assert.ok(sources.includes('data/maturity-template.xlsx'));
  for(const source of sources) {
    assert.ok(fs.existsSync(path.join(__dirname,'..',source)),source+' must exist for Docker COPY');
    assert.ok(ignore.includes('!'+source),source+' must be allowed after the data/* and *.xlsx exclusions');
    assert.ok(ignore.lastIndexOf('!'+source)>Math.max(ignore.lastIndexOf('data/*'),ignore.lastIndexOf('*.xlsx')),source+' inclusion must follow the broad exclusions');
  }
  assert.match(dockerfile,/cp -a data bundled-data/);
  assert.match(dockerfile,/CMD \["node", "scripts\/docker-start.js"\]/);
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
