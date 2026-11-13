// Run inside the isolated Docker smoke app, never against deployment data.
const assert = require('node:assert/strict');
const cache = require('../src/services/redisCacheService');
const { createClient } = require('redis');

(async () => {
  assert.equal(process.env.NIST_DOCKER, 'true');
  assert.equal(process.env.REDIS_CACHE_ENABLED, 'true');
  const client = createClient({url: 'redis://redis:6379'});
  client.on('error', () => {});
  try {
    await client.connect();
    await cache.set('dashboard', 'docker-smoke-fixture', {modules: []});
    assert.deepEqual(await cache.get('dashboard', 'docker-smoke-fixture'), {modules: []});
    const keys = await client.keys('nist-cache:v1:*:dashboard:*');
    assert.ok(keys.length > 0);
    const ttls = await Promise.all(keys.map(key => client.ttl(key)));
    assert.ok(ttls.every(ttl => ttl > 0 && ttl <= 15));
    cache.invalidateDashboard();
    assert.equal(await cache.get('dashboard', 'docker-smoke-fixture'), null);
    console.log('Redis Docker cache round-trip, TTL and invalidation passed.');
  } finally {cache.close(); client.destroy();}
})().catch(error => {console.error(error); process.exitCode = 1;});
