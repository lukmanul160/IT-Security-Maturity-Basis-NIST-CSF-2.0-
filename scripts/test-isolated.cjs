/**
 * Run the existing application suite against a disposable PostgreSQL cluster.
 * No .env, production restore, startup schedulers or application account login.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { execFileSync, spawn } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const pgBin = process.env.PERF_PG_BIN || (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/18/bin' : '');
const pgTool = name => pgBin ? path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : '')) : name;
const run = (name, args) => execFileSync(pgTool(name), args, { windowsHide: true, stdio: 'ignore', timeout: 60000 });

/** Bind a loopback port briefly to choose a free port for this test run. */
async function freePort() {
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nist-regression-'));
  let started = false;
  try {
    const port = await freePort();
    run('initdb', ['-D', path.join(root, 'pg'), '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8', '--no-sync']);
    run('pg_ctl', ['-D', path.join(root, 'pg'), '-l', path.join(root, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -F`, '-w', 'start']);
    started = true;
    // Only committed schema, inside this disposable cluster; no operational seed files.
    const { Client } = require('pg');
    const client = new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres',password:'',ssl:false});
    try { await client.connect(); await client.query(fs.readFileSync(path.join(projectRoot,'database/schema.sql'),'utf8')); }
    finally { await client.end(); }
    const env = { ...process.env, NIST_TEST_ROOT: root, DATABASE_URL: '', DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: 'postgres', DB_USER: 'postgres', DB_PASSWORD: '', DB_SSL: 'false', NODE_ENV: 'test', SESSION_COOKIE_SECURE: 'false' };
    // Reuse the exact npm-test file list instead of inventing a second suite.
    const command = require('../package.json').scripts.test;
    if (!command.startsWith('node --test ')) throw new Error('Review isolated runner: npm test entry changed.');
    const allTests = command.slice('node --test '.length).trim().split(/\s+/);
    const selected = process.argv.slice(2);
    if (selected.some(file => !allTests.includes(file))) throw new Error('Selected tests must belong to npm test.');
    const tests = selected.length ? selected : allTests;
    if (tests.some(file => !/^test\/[\w.-]+\.test\.js$/.test(file))) throw new Error('Unsupported test path in npm test.');
    const child = spawn(process.execPath, ['--require', path.join(__dirname, 'test-isolated-preload.cjs'), '--test', '--test-concurrency=2', '--test-timeout=60000', ...tests], { cwd: projectRoot, env, windowsHide: true, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve(signal ? 1 : code)); });
    process.exitCode = code ?? 1;
  } finally {
    if (started) run('pg_ctl', ['-D', path.join(root, 'pg'), '-m', 'immediate', '-w', 'stop']);
    // Destructive cleanup is restricted to this exact generated OS-temp folder.
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('nist-regression-')) throw new Error('Unexpected fixture root; refusing cleanup.');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
