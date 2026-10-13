const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const service = { module: { exports: {} }, require: () => ({ promises: {}, pool: {}, removeUnreferencedFile() {} }) };
vm.runInNewContext(fs.readFileSync('src/services/frameworkService.js', 'utf8'), service);
const normalize = service.module.exports.normalizeObjective;
const source = fs.readFileSync('frontend/client/src/workspace/features/iso27001/objectives-and-soa.js', 'utf8');
const ui = {};
vm.runInNewContext(source.slice(0, source.indexOf('function syncIsoRowActions')), ui);
const objective = (method, targetValue) => ({ year: 2026, objective: 'Evaluasi', targetValue, periodTargets: { _measurement: { method, unit: 'kegiatan' } } });
test('manual percentage accepts percent notation and rejects more than 100', () => {
  const item = normalize(objective('percentage', '95%'));
  assert.equal(ui.objectiveProgress(item, '95%', '96%'), '96%');
  assert.throws(() => normalize(objective('percentage', '101%')), /0-100/);
});
test('quantity achievement handles 35 items, one activity, and zero actual', () => {
  const item = normalize(objective('quantity', '35'));
  assert.equal(ui.objectiveProgress(item, '35', '35'), '100% capaian');
  assert.equal(ui.objectiveProgress(item, '35', '0'), '0% capaian');
  assert.equal(ui.objectiveProgress(item, '1', '1'), '100% capaian');
  assert.equal(ui.objectiveProgress(item, '1', ''), 'Belum ada realisasi');
  assert.throws(() => normalize(objective('quantity', '0')), /lebih dari 0/);
});
test('measurement metadata is excluded from period totals and legacy records remain supported', () => {
  const item = objective('quantity', '1');
  item.periodTargets['monthly-1'] = { actual: '1', status: 'Achieved' };
  assert.equal(ui.objectivePeriods(item).length, 1);
  assert.equal(normalize({ year: 2026, objective: 'Legacy', targetValue: 'Existing text' }).targetValue, 'Existing text');
});
