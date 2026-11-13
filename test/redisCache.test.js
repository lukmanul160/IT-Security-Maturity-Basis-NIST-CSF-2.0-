const test = require('node:test');
const assert = require('node:assert/strict');
const { createCache } = require('../src/services/redisCacheService');

test('manual installations ignore Redis enable flag without the Docker image marker', async () => {
  let connections = 0;
  const sandbox = {module: {exports: {}}, process: {env: {REDIS_CACHE_ENABLED: 'true'}}, Buffer, setTimeout, clearTimeout,
    require(name) {if(name === 'redis') {connections++; throw Error('Unexpected Redis import');} return require(name);},
  };
  require('node:vm').runInNewContext(require('node:fs').readFileSync(require.resolve('../src/services/redisCacheService'), 'utf8'), sandbox);
  await sandbox.module.exports.set('dashboard', 'fixture', {});
  assert.equal(await sandbox.module.exports.get('dashboard', 'fixture'), null);
  assert.equal(connections, 0);
});

function fixture() {
  const entries = new Map(), writes = [];
  const client = {
    isReady: false, on() {}, async connect() { this.isReady = true; },
    async get(key) { return entries.get(key) || null; },
    async set(key, value, options) { entries.set(key, value); writes.push({key, value, options}); },
    destroy() { this.isReady = false; },
  };
  return { client, entries, writes, createClient: () => client };
}

test('disabled cache never creates a connection, including write attempts', async () => {
  const cache = createCache({ createClient() { throw Error('Must not connect'); } });
  await cache.set('dashboard', 'user', {});
  assert.equal(await cache.get('dashboard', 'user'), null);
});

test('only allowlisted groups cache data, with hashed identities and bounded TTL', async () => {
  const f = fixture(), cache = createCache({ enabled: true, ...f });
  await cache.set('session', 'secret', {token: 'secret'});
  await cache.set('constructor', 'secret', {token: 'secret'});
  assert.equal(f.entries.size, 0);
  for (const [group, ttl] of [['dashboard', 15], ['cve', 300]]) {
    await cache.set(group, 'private-user', { count: 2 });
    assert.deepEqual(await cache.get(group, 'private-user'), { count: 2 });
    assert.equal(f.writes.at(-1).options.EX, ttl);
    assert.equal(f.writes.at(-1).key.includes('private-user'), false);
  }
  assert.equal(await cache.get('dashboard', 'another-user'), null);
  cache.invalidateDashboard();
  assert.equal(await cache.get('dashboard', 'private-user'), null);
  assert.deepEqual(await cache.get('cve', 'private-user'), {count: 2});
  cache.close();
});

test('expired or corrupt cache entries fall back to the primary source', async () => {
  const f = fixture(), cache = createCache({enabled: true, ...f});
  await cache.set('dashboard', 'user', {count: 1});
  const key = f.writes[0].key;
  f.entries.set(key, JSON.stringify({expiresAt: 0, data: {count: 99}}));
  assert.equal(await cache.get('dashboard', 'user'), null);
  f.entries.set(key, 'invalid json');
  assert.equal(await cache.get('dashboard', 'user'), null);
  cache.close();
});

test('hung Redis commands time out and open a cooldown without blocking data reads', async () => {
  const f = fixture();
  f.client.get = () => new Promise(() => {});
  const cache = createCache({enabled: true, ...f, timeoutMs: 20});
  const started = Date.now();
  assert.equal(await cache.get('dashboard', 'user'), null);
  assert.ok(Date.now() - started < 1000);
  assert.equal(f.client.isReady, false);
  assert.equal(await cache.get('dashboard', 'user'), null);
  cache.close();
});

test('connection failures are optional and oversized payloads are not cached', async () => {
  const broken = createCache({enabled: true, createClient() {throw Error('Unavailable');}});
  assert.equal(await broken.get('dashboard', 'user'), null);
  await broken.set('dashboard', 'user', {});
  const f = fixture(), cache = createCache({enabled: true, ...f});
  await cache.set('dashboard', 'user', 'x'.repeat(512 * 1024));
  assert.equal(f.entries.size, 0);
  cache.close();
});

test('Redis reconnects after a failed attempt and the cooldown has elapsed', async () => {
  const f = fixture();
  let attempts = 0;
  const cache = createCache({enabled: true, retryMs: 0, createClient() {
    if (++attempts === 1) throw Error('Fixture unavailable');
    return f.client;
  }});
  assert.equal(await cache.get('dashboard', 'user'), null);
  await cache.set('dashboard', 'user', {count: 2});
  assert.deepEqual(await cache.get('dashboard', 'user'), {count: 2});
  assert.equal(attempts, 2);
  cache.close();
});

test('database restore invalidates dashboard cache at both restore boundaries', () => {
  const cache = require('../src/services/redisCacheService');
  const auth = require('../src/config/auth');
  const before = cache.dashboardVersion();
  auth.beginDatabaseRestore();
  const during = cache.dashboardVersion();
  assert.notEqual(during, before);
  auth.endDatabaseRestore();
  assert.notEqual(cache.dashboardVersion(), during);
});
