/** Ordered, checksummed SQL migrations, serialized across replicas by PostgreSQL. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '../../database/migrations');
const migrationLock = 872162;
const checksum = sql => crypto.createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
const definitions = () => fs.readdirSync(root).filter(file => /^\d{4}-[a-z0-9-]+\.sql$/.test(file)).sort().map(id => {
  const sql = fs.readFileSync(path.join(root, id), 'utf8');
  return { id, sql, checksum: checksum(sql) };
});
async function migrate(db, { through, statusOnly = false, plan = definitions() } = {}) {
  if (through && !plan.some(row => row.id === through)) throw new Error(`Unknown migration: ${through}`);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [migrationLock]);
    let ledgerExists = true;
    if (statusOnly) ledgerExists = Boolean((await client.query("SELECT to_regclass('schema_migrations') AS present")).rows[0].present);
    else await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp())`);
    const appliedRows = ledgerExists ? (await client.query('SELECT id,checksum FROM schema_migrations ORDER BY id')).rows : [];
    const applied = new Map(appliedRows.map(row => [row.id, row.checksum]));
    for (const [id, digest] of applied) {
      const row = plan.find(row => row.id === id);
      if (!row || row.checksum !== digest) throw new Error(`Migration checksum mismatch or missing file: ${id}. Restore the original migration; add a new version.`);
    }
    const result = [];
    for (const row of plan) {
      if (!applied.has(row.id) && !statusOnly) {
        try { await client.query(row.sql); }
        catch (error) { error.message = `${row.id}: ${error.message}`; throw error; }
        await client.query('INSERT INTO schema_migrations(id,checksum) VALUES($1,$2)', [row.id, row.checksum]);
      }
      result.push({ id: row.id, applied: applied.has(row.id) || !statusOnly });
      if (row.id === through) break;
    }
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
// Compatibility entry points still called by services perform no DDL after startup.
let ready;
function ensureSchema() {
  if (!ready) ready = migrate(require('../config/database').pool).catch(error => { ready = undefined; throw error; });
  return ready;
}
module.exports = { migrate, ensureSchema, definitions, checksum };
