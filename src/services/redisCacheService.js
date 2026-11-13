// Optional, disposable Docker cache. Never used as a source of business truth.
const { createHash, randomUUID } = require('node:crypto');
const policies = Object.freeze({ dashboard: 15, cve: 300 });

function createCache({ enabled = false, url, createClient, timeoutMs = 200, retryMs = 30000 } = {}) {
  let client, connecting, retryAt = 0;
  let namespace = randomUUID(); // Dashboard is isolated across app restarts/restores.
  function reset() {
    const previous = client;
    client = undefined;
    retryAt = Date.now() + retryMs;
    try { previous?.destroy(); } catch {}
  }
  async function bounded(operation) {
    let timer;
    try {
      return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Cache timeout')), timeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function connection() {
    if (!enabled || Date.now() < retryAt) return null;
    if (client?.isReady) return client;
    if (!connecting) connecting = Promise.resolve().then(async () => {
      try {
        client = (createClient || require('redis').createClient)({
          url, disableOfflineQueue: true, commandsQueueMaxLength: 128,
          socket: { connectTimeout: timeoutMs, reconnectStrategy: false },
        });
        client.on('error', () => {}); // Do not log URLs, payloads or credentials.
        await bounded(() => client.connect());
        return client;
      } catch { reset(); return null; }
    }).finally(() => { connecting = undefined; });
    return connecting;
  }
  async function get(group, identity) {
    if (!Object.hasOwn(policies, group)) return null;
    try {
      const active = await connection();
      if (!active) return null;
      const value = JSON.parse(await bounded(() => active.get(key(group, identity))));
      return value && value.expiresAt > Date.now() ? value.data : null;
    } catch { reset(); return null; }
  }
  function key(group, identity) {
    return `nist-cache:v1:${group === 'dashboard' ? namespace : 'public'}:${group}:${createHash('sha256').update(identity).digest('hex')}`;
  }
  async function set(group, identity, data) {
    if (!Object.hasOwn(policies, group)) return;
    try {
      const active = await connection();
      if (!active) return;
      const payload = JSON.stringify({ expiresAt: Date.now() + policies[group] * 1000, data });
      if (Buffer.byteLength(payload) > 512 * 1024) return;
      await bounded(() => active.set(key(group, identity), payload, { EX: policies[group] }));
    } catch { reset(); }
  }
  return { get, set, dashboardVersion: () => namespace, invalidateDashboard: () => { namespace = randomUUID(); }, close: reset };
}

module.exports = createCache({
  enabled: process.env.NIST_DOCKER === 'true' && process.env.REDIS_CACHE_ENABLED === 'true',
  url: 'redis://redis:6379',
});
module.exports.createCache = createCache;
