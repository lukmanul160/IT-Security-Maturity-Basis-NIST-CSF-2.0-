// Synthetic CPU benchmark: never loads .env or connects to PostgreSQL.
require('./security-test-isolation.cjs');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { mock } = require('node:test');
const permissions = require('../src/services/permissionService');
const { pool } = require('../src/config/database');
const servicePath = require.resolve('../src/services/monitoringDashboardService');
// Run the committed implementation without editing the working tree.
if (process.argv.includes('--baseline')) {
  const { execFileSync } = require('node:child_process');
  const Module = require('node:module');
  const baseline = new Module(servicePath, module);
  baseline.filename = servicePath;
  baseline.paths = module.paths;
  baseline._compile(execFileSync('git', ['show', 'HEAD:src/services/monitoringDashboardService.js'], { encoding: 'utf8', windowsHide: true }), servicePath);
  require.cache[servicePath] = baseline;
}
const service = require(servicePath);
const count = Number(process.env.PERF_ROWS || 1000);
if (!Number.isInteger(count) || count < 1 || count > 100000) throw Error('Invalid PERF_ROWS');
const rows = Array.from({ length: count }, (_, i) => ({
  id: i, code: `C${i}`, category: 'Detect', created_at: '2026-09-30T18:00:00Z',
  status: 'Active', annual_status: 'Pending', implementation: 'Implemented', evidence: [],
  risk_rating: 'High', residual_rating: 'Medium', risk_owner: 'Fixture', treatment_action: 'Mitigate',
  residual_likelihood: 2, residual_impact: 2, deadline: '2026-11-01', kind: 'finding', severity: 'High',
  due_date: '2026-11-01', threats: [{ status: 'Open', severity: 'High' }],
  approval_status: 'Approved', last_review: '2026-01-01', review_cycle: 'Annual',
  assessment: { confidentiality: 3, integrity: 3, availability: 3, likelihood: 2 },
  renewal_date: '2026-11-01', units: 42, devices: 1, type: 'depends_on',
  expiry_date: '2026-11-01', relationship_status: 'Active', assessment_status: 'Pending',
  risk_level: 'High', next_review: '2026-11-01', review_date: '2026-11-01', responses: { riskTier: 'High' },
  sections: [['Section', ['Question']]], folder: 'Fixture', linked: true, role: 'viewer',
  source: 'Fixture', result: 'Berhasil', count: 1, size: 1024,
}));
mock.method(pool, 'query', async sql => {
  if (!/^SELECT\b/i.test(sql)) throw Error('Benchmark only supports SELECT');
  return { rows: /COUNT\(/i.test(sql) && !/GROUP BY/i.test(sql) ? [{ count }] : rows };
});
mock.method(require('../src/services/assessmentService'), 'getAssessment', async () => ({ scores: {} }));
mock.method(require('../src/services/assessmentGapService'), 'list', async () => []);
mock.method(require('../src/services/assetDiagramService'), 'ensureStore', async () => {});
mock.method(require('../src/services/evidenceAccessService'), 'list', async () => rows);
mock.method(require('../src/services/backupService'), 'listBackups', async () => rows);
mock.method(require('../src/services/fileBackupService'), 'list', async () => rows);
let access = {};
mock.method(permissions, 'getRoleActions', async () => access);
const now = new Date('2026-10-19T00:00:00Z');
async function measure(id, role, keys) {
  access = Object.fromEntries(keys.map(key => [key, { read: true }]));
  const times = [];
  for (let i = 0; i < 6; i++) {
    const start = performance.now();
    const result = await service.snapshot({ role, username: 'fixture' }, now);
    if (!result.modules.length || result.modules.some(row => row.state !== 'ready')) throw Error(`${id}: invalid summary`);
    if (i) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return { id, medianMs: times[2], maxMs: times[4] };
}
(async () => {
  const ids = ['csf', 'privacy', 'framework', 'iso27001', 'iso27001-soa', 'risk-management',
    'risk-acceptance', 'audit-finding-tracker', 'threat-modelling', 'policy-register',
    'asset-register', 'server-racks', 'asset-modelling', 'personnel-certification',
    'tprm-register', 'tprm-questionnaire', 'questionnaire-templates', 'tprm', 'tprm-tiering', 'knowledge-notes', 'files'];
  const results = [];
  for (const id of ids) results.push(await measure(id, 'viewer', [id, ...(id === 'csf' ? ['assessment'] : id === 'privacy' ? ['privacy-assessment'] : [])]));
  results.push(await measure('administration', 'admin', []));
  results.push(await measure('all-summaries', 'admin', [...ids, 'assessment', 'privacy-assessment']));
  const report = { node: process.version, fixtureRows: count, samples: 5,
    scope: 'Real monitoring summary CPU with synthetic SQL/service fixtures; no database, network, browser, storage or email latency. iso27001 includes objectives; administration includes accounts/audit/backups/SMTP/storage.', results };
  fs.mkdirSync('output', { recursive: true });
  const label = process.argv[2] || 'current';
  if (!/^[a-z-]+$/.test(label)) throw Error('Invalid output label');
  fs.writeFileSync(`output/module-summary-${label}.json`, JSON.stringify(report, null, 2));
  for (const row of results) console.log(`${row.id}: median=${row.medianMs.toFixed(2)}ms max=${row.maxMs.toFixed(2)}ms`);
})().catch(error => { console.error(error); process.exitCode = 1; });
