/** PostgreSQL is authoritative across replicas and restarts; failures never fall back to local state. */
const crypto = require('node:crypto');
const { pool } = require('../config/database');
const restoreLock = 872161;
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const unavailable = () => Object.assign(new Error('Database restore sedang berlangsung.'), { status: 503 });
const createAuthState = db => ({
  async restoring() {
    return (await db.query("SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=0 AND objid=$1 AND objsubid=1 AND mode='ExclusiveLock' AND granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())) AS restoring", [restoreLock])).rows[0].restoring;
  },
  async create(user) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      if (!(await client.query('SELECT pg_try_advisory_xact_lock_shared($1) AS locked', [restoreLock])).rows[0].locked) throw unavailable();
      const token = crypto.randomBytes(32).toString('hex');
      // Lock the account while verifying its credential snapshot. A concurrent password/role change cannot resurrect a session.
      const account = (await client.query('SELECT password_hash, role FROM app_users WHERE username=$1 FOR UPDATE', [user.username])).rows[0];
      if (!account || (user.credentialHash && account.password_hash !== user.credentialHash) || account.role !== user.role) throw Object.assign(new Error('Akun berubah. Silakan login kembali.'), { status: 401 });
      await client.query("DELETE FROM auth_sessions WHERE expires_at <= clock_timestamp()");
      await client.query(`INSERT INTO auth_sessions(username,token_hash,role,credential_hash,expires_at)
        VALUES($1,$2,$3,$4,clock_timestamp()+INTERVAL '8 hours')
        ON CONFLICT(username) DO UPDATE SET token_hash=EXCLUDED.token_hash,role=EXCLUDED.role,credential_hash=EXCLUDED.credential_hash,
        created_at=clock_timestamp(),expires_at=EXCLUDED.expires_at,office_module='account'`, [user.username, hash(token), account.role, account.password_hash]);
      await client.query('COMMIT');
      return token;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  },
  async get(token) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    if (await this.restoring()) return null;
    const row = (await db.query(`SELECT s.username,s.role,s.created_at,s.office_module FROM auth_sessions s
      JOIN app_users u ON u.username=s.username AND u.password_hash=s.credential_hash AND u.role=s.role
      WHERE s.token_hash=$1 AND s.expires_at>clock_timestamp()`, [hash(token)])).rows[0];
    return row ? { username: row.username, role: row.role, createdAt: new Date(row.created_at).getTime(), officeModule: row.office_module } : null;
  },
  async remove(token) { if (token) await db.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hash(token)]); },
  async removeUser(username) { await db.query('DELETE FROM auth_sessions WHERE username=$1', [username]); },
  async presence(token, module) { await db.query('UPDATE auth_sessions SET office_module=$2 WHERE token_hash=$1 AND expires_at>clock_timestamp()', [hash(token), module]); },
  async office() {
    if (await this.restoring()) return new Map();
    const { rows } = await db.query(`SELECT s.username,s.created_at,s.office_module FROM auth_sessions s JOIN app_users u
      ON u.username=s.username AND u.password_hash=s.credential_hash AND u.role=s.role WHERE s.expires_at>clock_timestamp()`);
    return new Map(rows.map(row => [row.username, { module: row.office_module, createdAt: new Date(row.created_at).getTime() }]));
  },
  async consume(namespace, key, limit, windowMs) {
    if (await this.restoring()) throw unavailable();
    const keyHash = hash(namespace + '\0' + key);
    // One statement serializes concurrent attempts, using database time rather than replica clocks.
    const row = (await db.query(`INSERT INTO auth_rate_limits(key_hash,attempts,expires_at)
      VALUES($1,1,clock_timestamp()+$2*INTERVAL '1 millisecond') ON CONFLICT(key_hash) DO UPDATE SET
      attempts=CASE WHEN auth_rate_limits.expires_at<=clock_timestamp() THEN 1 ELSE LEAST(auth_rate_limits.attempts+1,1000000) END,
      expires_at=CASE WHEN auth_rate_limits.expires_at<=clock_timestamp() OR ($3 AND auth_rate_limits.attempts=$4-1)
        THEN EXCLUDED.expires_at ELSE auth_rate_limits.expires_at END
      RETURNING attempts, GREATEST(1,CEIL(EXTRACT(EPOCH FROM (expires_at-clock_timestamp()))))::int AS retry_after`, [keyHash, windowMs, namespace === 'login-account', limit])).rows[0];
    await db.query('DELETE FROM auth_rate_limits WHERE key_hash IN (SELECT key_hash FROM auth_rate_limits WHERE expires_at<=clock_timestamp() LIMIT 1000)');
    return { allowed: row.attempts <= limit, retryAfter: row.retry_after };
  },
  async reset(namespace, key) { await db.query('DELETE FROM auth_rate_limits WHERE key_hash=$1', [hash(namespace + '\0' + key)]); },
});
const state = createAuthState(pool);
module.exports = { state, createAuthState, restoreLock };
