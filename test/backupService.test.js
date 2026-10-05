const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function load(error, databaseOverrides = {}) {
  const calls = [];
  const removed = [];
  let queries = 0;
  const restoreLifecycle = [];
  const mocks = {
    fs: { promises: { mkdir: async () => {}, stat: async () => ({ size: 100, mtime: new Date() }), rm: async file => removed.push(file) } },
    path,
    child_process: { execFile: (file, args, options, callback) => { calls.push({ file, args }); callback(error || null, '', ''); } },
    util: require('node:util'),
    '../config/env': { database: { host: 'localhost', port: 5432, user: 'test', name: 'application', ...databaseOverrides } },
    '../config/paths': { backupRoot: path.join('test', 'backups') },
    '../config/database': { pool: { query: () => { queries++; throw new Error('Unexpected partial snapshot'); } } }
  };
  mocks['../config/auth'] = { beginDatabaseRestore: () => restoreLifecycle.push('begin'), endDatabaseRestore: () => restoreLifecycle.push('end') };
  const context = vm.createContext({ require: name => mocks[name], module: { exports: {} }, process: { platform: 'linux', env: { PG_DUMP_PATH: 'configured-pg-dump', PG_RESTORE_PATH: 'configured-pg-restore' } } });
  vm.runInContext(fs.readFileSync('src/services/backupService.js', 'utf8'), context);
  return { api: context.module.exports, calls, removed, restoreLifecycle, queries: () => queries };
}

test('backup dumps the whole configured database without table or schema exclusions', async () => {
  const { api, calls } = load();
  const result = await api.createBackup();
  assert.equal(calls[0].file, 'configured-pg-dump');
  assert.ok(calls[0].args.includes('--format=custom'));
  assert.equal(calls[0].args[calls[0].args.indexOf('--dbname') + 1], 'application');
  assert.ok(!calls[0].args.some(arg => /--(?:schema|table|exclude|data-only|schema-only)/.test(arg)));
  assert.equal(result.format, 'PostgreSQL custom dump');
  assert.match(result.scope, /Seluruh schema/);
});

test('missing pg_dump fails clearly rather than reporting a partial JSON backup as complete', async () => {
  const stub = load(Object.assign(new Error('missing'), { code: 'ENOENT' }));
  await assert.rejects(stub.api.createBackup(), error => error.status === 503 && /PG_DUMP_PATH/.test(error.message));
  assert.equal(stub.queries(), 0);
  assert.equal(stub.removed.length, 1);
});

test('dump errors never return success and remove the incomplete archive', async () => {
  const stub = load(Object.assign(new Error('failure'), { stderr: 'permission denied' }));
  await assert.rejects(stub.api.createBackup(), /permission denied/);
  assert.equal(stub.removed.length, 1);
});

test('dump restore uses one transaction for all database objects', async () => {
  const stub = load();
  await stub.api.restoreBackup({ path: 'temporary.dump', originalname: 'nist-basis-20261002T000000Z.dump' });
  assert.equal(stub.calls[0].file, 'configured-pg-restore');
  assert.ok(stub.calls[0].args.includes('--single-transaction'));
  assert.ok(stub.calls[0].args.includes('--clean'));
  assert.deepEqual(stub.restoreLifecycle, ['begin', 'end']);
});

test('failed restore releases authentication lock and removes the uploaded archive', async () => {
  const stub = load(new Error('restore failed'));
  await assert.rejects(stub.api.restoreBackup({ path: 'temporary.dump', originalname: 'nist-basis-20261002T000000Z.dump' }), /restore failed/);
  assert.deepEqual(stub.restoreLifecycle, ['begin', 'end']);
  assert.deepEqual(stub.removed, ['temporary.dump']);
});

test('cross-installation restore does not depend on source owners or granted roles', async () => {
  for (const settings of [{}, { url: 'postgresql://target/application' }]) {
    const stub = load(undefined, settings);
    await stub.api.restoreBackup({ path: 'temporary.dump', originalname: 'nist-basis-20261002T000000Z.dump' });
    assert.ok(stub.calls[0].args.includes('--no-owner'));
    assert.ok(stub.calls[0].args.includes('--no-acl'));
    assert.ok(stub.calls[0].args.includes('--single-transaction'));
    if (settings.url) assert.equal(stub.calls[0].args[1], settings.url);
  }
});
