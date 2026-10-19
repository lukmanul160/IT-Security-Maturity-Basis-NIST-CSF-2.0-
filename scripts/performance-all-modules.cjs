// Own disposable PostgreSQL cluster. No .env, operational data or schedulers.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
require('dotenv').config = () => ({ parsed: {} });
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nist-module-perf-'));
const pgBin = process.env.PERF_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const pgTool = name => path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : ''));
const run = (name, args) => execFileSync(pgTool(name), args, { windowsHide: true, stdio: 'ignore', timeout: 60000 });
const duration = Number(process.env.PERF_SECONDS || 1);
const levels = (process.env.PERF_LEVELS || '1,10,25').split(',').map(Number);
const label = process.env.PERF_LABEL || 'after';
if (!/^[a-z-]+$/.test(label)) throw Error('Invalid output label');
const reportFile = `output/all-module-performance-${label}.json`;
if (!(duration > 0 && duration <= 60) || levels.some(n => !Number.isInteger(n) || n < 1 || n > 100)) throw Error('Invalid load settings');
const endpoints = [
  ['csf', '/csf'], ['assessment', '/assessment'], ['privacy', '/privacy'],
  ['privacy-assessment', '/privacy/assessment'], ['framework', '/frameworks'],
  ['iso27001', '/frameworks/iso27001/controls'], ['iso27001-soa', '/frameworks/iso27001-soa/controls'],
  ['iso-objectives', '/frameworks/iso27001/objectives'], ['ikas', '/frameworks/ikas/controls'],
  ['ikas-assessment', '/ikas/assessment'], ['assessment-periods', '/assessment-periods/csf'],
  ['assessment-gaps', '/assessment-gaps/csf'], ['budget', '/budget?year=2026'],
  ['risk-management', '/risk-management'], ['risk-acceptance', '/risk-acceptance'],
  ['threat-modelling', '/threat-modelling'], ['policy-register', '/policy-register'],
  ['asset-register', '/asset-management/assets'], ['server-racks', '/asset-management/racks'],
  ['asset-modelling', '/asset-management/diagram'], ['personnel-certification', '/personnel-certifications'],
  ['certification-roadmap', '/certification-roadmap-catalog'], ['tprm-register', '/tprm'],
  ['tprm-questionnaire', '/tprm-questionnaires'], ['questionnaire-templates', '/questionnaire-templates'],
  ['audit-finding-tracker', '/audit-finding-tracker'], ['knowledge-notes', '/knowledge-notes'],
  ['files', '/files'], ['reporting-regulator', '/compliance/reports'], ['narahubung', '/compliance/contacts'],
  ['surat-pernyataan', '/statements/types'], ['office-design', '/office-design'],
  ['account', '/auth/users'], ['permissions', '/auth/permissions'], ['audit', '/audit'],
  ['backups', '/backups'], ['file-backups', '/file-backups'], ['smtp', '/smtp-settings'],
  ['storage', '/storage-settings'], ['website-settings', '/website-settings'],
  ['reminder-recipients', '/reminder-recipients'], ['monitoring-dashboard', '/monitoring-dashboard'],
];
let server, pool, auth, token;
const report = { startedAt: new Date().toISOString(), node: process.version,
  scope: 'Loopback HTTP, real disposable PostgreSQL, startup reference seeds plus synthetic notes; admin session; normal audit writes; no schedulers/email. Warm GETs, same host generator, no browser rendering. TPRM framework/tiering reference UI shares TPRM endpoints. No backup/restore mutation or external cloud test.',
  durationSeconds: duration, results: [] };
async function freePort() {
  const listener = net.createServer();
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}
async function main() {
  const port = await freePort();
  run('initdb', ['-D', path.join(root, 'pg'), '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8', '--no-sync']);
  run('pg_ctl', ['-D', path.join(root, 'pg'), '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -F`, '-w', 'start']);
  Object.assign(process.env, { DATABASE_URL: '', DB_HOST: '127.0.0.1', DB_PORT: String(port),
    DB_NAME: 'nist_perf_disposable', DB_USER: 'postgres', DB_PASSWORD: '', DB_SSL: 'false',
    NODE_ENV: 'test', SESSION_COOKIE_SECURE: 'false' });
  const paths = require('../src/config/paths');
  for (const key of ['dataRoot', 'uploadRoot', 'backupRoot']) {
    paths[key] = path.join(root, key); fs.mkdirSync(paths[key]);
  }
  for (const key of ['stateFile', 'privacyData', 'riskIndicatorsData']) paths[key] = path.join(paths.dataRoot, path.basename(paths[key]));
  // Only committed public reference seeds, never working-tree operational files.
  for (const file of ['csf-data.json', 'privacy-data.json', 'iso-27001-data.json', 'iso-27001-soa-data.json', 'risk-indicators.json', 'ikas-data.json']) {
    fs.writeFileSync(path.join(paths.dataRoot, file), execFileSync('git', ['show', 'HEAD:data/' + file], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 }));
  }
  // Reuse the exact startup initializers, stopping before listen and schedulers.
  const serverFile = require.resolve('../src/server');
  const source = fs.readFileSync(serverFile, 'utf8');
  const cutoff = source.indexOf('  await new Promise((resolve, reject) => {');
  if (cutoff < 0) throw Error('Startup changed; review performance initializer');
  const Module = require('node:module');
  const initializer = new Module(serverFile, module);
  initializer.filename = serverFile; initializer.paths = module.paths;
  initializer._compile(source.slice(0, cutoff).replace("require('./middleware/audit').startAuditRecovery();", '') + '\n}\nmodule.exports = start;', serverFile);
  ({ pool } = require('../src/config/database'));
  await initializer.exports();
  await pool.query("INSERT INTO app_users(username,password_hash,role) VALUES('perf-admin','unused-fixture','admin')");
  const noteColumns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='knowledge_notes'");
  if (noteColumns.rows.some(row => row.column_name === 'title')) {
    await pool.query("INSERT INTO knowledge_notes(title,content) SELECT 'Fixture ' || n, 'Synthetic performance fixture [[Fixture 1]]' FROM generate_series(1,1000) n");
  }
  auth = require('../src/config/auth'); token = auth.createSession({ username: 'perf-admin', role: 'admin' });
  server = require('../src/app').listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const request = async endpoint => {
    const start = performance.now();
    try {
      const res = await fetch(base + endpoint, { headers: { Cookie: auth.sessionCookie + '=' + token }, signal: AbortSignal.timeout(15000) });
      const body = await res.text();
      let partial = false;
      if (endpoint === '/monitoring-dashboard' && res.ok) partial = JSON.parse(body).modules.some(row => row.state !== 'ready');
      return { ms: performance.now() - start, status: res.status, bytes: Buffer.byteLength(body), partial };
    } catch { return { ms: performance.now() - start, status: 'network-error', bytes: 0 }; }
  };
  fs.mkdirSync('output', { recursive: true });
  const selected = process.env.PERF_MODULES ? new Set(process.env.PERF_MODULES.split(',')) : null;
  const cases = endpoints.filter(([id]) => !selected || selected.has(id));
  if (selected && cases.length !== selected.size) throw Error('Unknown PERF_MODULES entry');
  for (const [id, endpoint] of process.argv.includes('--regression-only') ? [] : cases) {
    const preflight = await request(endpoint);
    if (preflight.status !== 200 || preflight.partial) {
      report.results.push({ id, endpoint, preflightStatus: preflight.status, partial: preflight.partial });
      console.log(`${id}: PREFLIGHT FAILED ${preflight.status}`); continue;
    }
    for (const concurrency of levels) {
      const samples = [], start = performance.now(), until = start + duration * 1000;
      await Promise.all(Array.from({ length: concurrency }, async () => {
        while (performance.now() < until) samples.push(await request(endpoint));
      }));
      const elapsed = (performance.now() - start) / 1000;
      const times = samples.map(row => row.ms).sort((a, b) => a - b);
      const errors = samples.filter(row => row.status !== 200 || row.partial).length;
      const result = { id, endpoint, concurrency, requests: samples.length,
        errors, p50Ms: times[Math.ceil(times.length * .5) - 1], p95Ms: times[Math.ceil(times.length * .95) - 1],
        p99Ms: times[Math.ceil(times.length * .99) - 1], successfulRps: (samples.length - errors) / elapsed,
        rssMB: process.memoryUsage().rss / 1048576, dbWaiting: pool.waitingCount };
      report.results.push(result);
      fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
      console.log(`${id} c=${concurrency}: p95=${result.p95Ms.toFixed(1)}ms errors=${errors}/${samples.length}`);
    }
  }
  if (!process.argv.includes('--regression-only')) fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  if (report.results.some(row => row.preflightStatus || row.errors)) process.exitCode = 1;
  if (process.argv.includes('--regression') || process.argv.includes('--regression-only')) {
    const { spawn } = require('node:child_process');
    const args = require('../package.json').scripts.test.split(' ').slice(1);
    const output = fs.openSync('output/performance-regression-postgres.tap', 'w');
    const child = spawn(process.execPath, ['--require', './scripts/performance-test-environment.cjs', '--test-concurrency=2', '--test-timeout=120000', ...args], {
      windowsHide: true, env: { ...process.env, PERF_TEST_ROOT: root }, stdio: ['ignore', output, output],
    });
    const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
    fs.closeSync(output);
    console.log(`Regression on disposable PostgreSQL: exit=${exitCode}; output/performance-regression-postgres.tap`);
    if (exitCode) process.exitCode = 1;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (token) auth.destroySession(token);
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (pool) await pool.end();
  if (fs.existsSync(path.join(root, 'pg', 'postmaster.pid'))) {
    run('pg_ctl', ['-D', path.join(root, 'pg'), '-m', 'immediate', '-w', 'stop']);
  }
  // mkdtemp owns this directory; never remove a configured application path.
  if (path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('nist-module-perf-')) fs.rmSync(root, { recursive: true, force: true });
});
