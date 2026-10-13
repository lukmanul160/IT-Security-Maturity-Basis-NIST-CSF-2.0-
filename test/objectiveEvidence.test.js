const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('objective evidence authorization checks new references against existing period evidence', async () => {
  const previous = { id: 4, periodTargets: { 'monthly-1': { evidence: [{ path: 'upload/old.pdf' }] } } };
  let checked;
  const context = {
    frameworkService: { listInformationSecurityObjectives: async () => [previous] },
    evidenceAccess: { assertReferences: async (...args) => { checked = args; } }
  };
  const code = fs.readFileSync('src/controllers/frameworkController.js', 'utf8');
  vm.runInNewContext(code.slice(code.indexOf('async function authorizeObjectiveEvidence')), context);
  const req = { params: { id: '4' }, user: { username: 'owner' }, body: { periodTargets: {
    _measurement: { method: 'quantity' },
    'monthly-1': { evidence: [{ path: 'upload/old.pdf' }, { path: 'upload/new.pdf' }] }
  } } };
  await context.authorizeObjectiveEvidence(req);
  assert.deepEqual(Array.from(checked[0], file => file.path), ['upload/old.pdf', 'upload/new.pdf']);
  assert.deepEqual(Array.from(checked[1], file => file.path), ['upload/old.pdf']);
  assert.equal(checked[2], req.user);
  req.body.periodTargets['monthly-1'].evidence = {};
  await assert.rejects(context.authorizeObjectiveEvidence(req), error => error.status === 400);
});

test('calendar uploads retain existing evidence, notes and edited realization', async () => {
  const item = { id: 4, periodTargets: { 'monthly-1': { notes: 'Retain', evidence: [{ path: 'upload/old.pdf' }] } } };
  const status = {};
  const container = { dataset: {}, querySelector: () => status, append() {} };
  const input = { dataset: { objectiveEvidenceUpload: '4', evidencePeriod: 'monthly-1' }, files: [{ name: 'new.pdf' }], closest: () => container };
  let saved;
  const context = {
    isoObjectives: [item], $: () => ({}),
    collectObjectivePeriods: () => ({ 'monthly-1': { actual: '1', target: '1' } }),
    saveFilesToServer: async () => [{ path: 'upload/new.pdf', name: 'new.pdf' }],
    evidenceReference: file => file,
    fetch: async (_, options) => { saved = JSON.parse(options.body); return { ok: true, json: async () => saved }; },
    objectiveEvidenceList: () => 'Evidence links', document: { createElement: () => ({ append() {} }) }
  };
  const code = fs.readFileSync('frontend/client/src/workspace/features/iso27001/objectives-and-soa.js', 'utf8');
  vm.runInNewContext(code.slice(code.indexOf('async function uploadObjectiveEvidence'), code.indexOf("$('isoObjectiveCalendarForm').addEventListener('change'", code.indexOf('async function uploadObjectiveEvidence'))), context);
  await context.uploadObjectiveEvidence(input);
  assert.equal(saved.periodTargets['monthly-1'].actual, '1');
  assert.equal(saved.periodTargets['monthly-1'].notes, 'Retain');
  assert.equal(saved.periodTargets['monthly-1'].evidence.length, 2);
  assert.equal(status.textContent, 'Bukti tersimpan.');
  assert.equal(input.disabled, false);
});

for (const replace of [false, true]) test(replace ? 'replacing period evidence retains other files' : 'removing period evidence keeps other files and calendar drafts', async () => {
  const item = { id: 4, periodTargets: { 'monthly-1': { notes: 'Keep note', evidence: [{ path: 'upload/old.pdf' }, { path: 'upload/keep.pdf' }] } } };
  const status = {}, list = {};
  const container = { dataset: {}, querySelector: selector => selector.includes('status') ? status : list };
  const control = { dataset: { objectiveEvidenceId: '4', evidencePeriod: 'monthly-1', evidenceIndex: '0' }, files: [{ name: 'new.pdf' }], closest: () => container };
  let saved;
  const context = { isoObjectives: [item], confirm: () => true, $: () => ({}),
    collectObjectivePeriods: () => ({ 'monthly-1': { actual: '35' } }),
    saveFilesToServer: async () => [{ path: 'upload/new.pdf' }], evidenceReference: file => file,
    objectiveEvidenceList: () => 'Updated list',
    fetch: async (_, options) => { saved = JSON.parse(options.body); return { ok: true, json: async () => saved }; }
  };
  const code = fs.readFileSync('frontend/client/src/workspace/features/iso27001/objectives-and-soa.js', 'utf8');
  const start = code.indexOf('async function changeObjectiveEvidence');
  vm.runInNewContext(code.slice(start, code.indexOf("$('isoObjectiveCalendarForm').addEventListener('change'", start)), context);
  await context.changeObjectiveEvidence(control, replace);
  const period = saved.periodTargets['monthly-1'];
  assert.equal(period.actual, '35'); assert.equal(period.notes, 'Keep note');
  assert.deepEqual(period.evidence.map(file => file.path), replace ? ['upload/new.pdf', 'upload/keep.pdf'] : ['upload/keep.pdf']);
  assert.equal(list.innerHTML, 'Updated list');
  assert.equal(container.dataset.busy, 'false');
});
