const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataRoot } = require('../config/paths');
function createAuditRecovery({ directory = path.join(dataRoot, 'audit-pending'), writeEvent, alert = message => console.error(message) } = {}) {
  let chain = Promise.resolve();
  let timer;
  const serial = task => {
    const result = chain.then(task);
    chain = result.catch(() => {});
    return result;
  };
  async function pending() {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    return (await fs.readdir(directory)).filter(name => /^[0-9a-f-]+\.json$/.test(name)).sort();
  }
  function recover() {
    return serial(async () => {
      for (const name of (await pending()).slice(0, 100)) {
        const filename = path.join(directory, name);
        try {
          const event = JSON.parse(await fs.readFile(filename, 'utf8'));
          await writeEvent(event);
          await fs.rm(filename);
        } catch (error) {
          alert(`[audit-recovery] Retry failed; pending event retained: ${error.message}`);
          break;
        }
      }
    });
  }
  function start() {
    if (timer) return;
    timer = setInterval(() => recover().catch(error => alert(`[audit-recovery] ${error.message}`)), 30000);
    timer.unref();
    recover().catch(error => alert(`[audit-recovery] ${error.message}`));
  }
  async function save(event) {
    const retained = { ...event, details: { ...event.details, auditCapturedAt: new Date().toISOString() } };
    try { await writeEvent(retained); }
    catch (error) {
      alert(`[audit-recovery] Database write failed; retaining event on disk: ${error.message}`);
      await serial(async () => {
        if ((await pending()).length >= 1000) throw new Error('Audit recovery queue is full; operator intervention required');
        const json = JSON.stringify(retained);
        if (Buffer.byteLength(json) > 128 * 1024) throw new Error('Audit recovery event exceeds 128 KB');
        const filename = path.join(directory, `${crypto.randomUUID()}.json`);
        const temporary = `${filename}.tmp`;
        try {
          const handle = await fs.open(temporary, 'wx', 0o600);
          try { await handle.writeFile(json); await handle.sync(); } finally { await handle.close(); }
          await fs.rename(temporary, filename);
        } finally { await fs.rm(temporary, { force: true }); }
      });
    }
  }
  return { save, recover, start, stop() { clearInterval(timer); timer = undefined; } };
}
module.exports = { createAuditRecovery };
