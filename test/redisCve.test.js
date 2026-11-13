const test = require('node:test');
const assert = require('node:assert/strict');
const cache = require('../src/services/redisCacheService');
const service = require('../src/services/technologyVulnerabilityService');

test('CVE cache hit skips NVD, preserves cached metadata and validates input first', async t => {
  const read = t.mock.method(cache, 'get', async (group, key) => {
    assert.equal(group, 'cve');
    assert.equal(JSON.parse(key).name, 'Fixture Redis');
    return {items: [], checkedAt: '2026-11-13T00:00:00.000Z', total: 0};
  });
  const result = await service.lookup({name: 'Fixture Redis', version: '1.0'}, {request() {throw Error('Unexpected NVD');}});
  assert.equal(result.cached, true);
  assert.equal(result.total, 0);
  assert.equal(result.checkedAt, '2026-11-13T00:00:00.000Z');
  await assert.rejects(service.lookup({name: '', version: '1.0'}), {status: 400});
  assert.equal(read.mock.callCount(), 1);
});

test('CVE miss caches only successful normalized results', async t => {
  t.mock.method(cache, 'get', async () => null);
  const writes = t.mock.method(cache, 'set', async () => {});
  const result = await service.lookup({name: 'Fixture NVD', version: '1.0'}, {
    now: () => 2000000000000, request: async () => ({totalResults: 0, vulnerabilities: []}),
  });
  assert.equal(result.cached, false);
  assert.equal(writes.mock.callCount(), 1);
  assert.equal(writes.mock.calls[0].arguments[0], 'cve');
  await assert.rejects(service.lookup({name: 'Fixture failure', version: '1.0'}, {
    now: () => 2000000010000, request: async () => {throw Error('Fixture provider failure');},
  }));
  assert.equal(writes.mock.callCount(), 1);
});
