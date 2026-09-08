const { pool } = require('../config/database');

async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_events (
    id BIGSERIAL PRIMARY KEY,
    request_id TEXT NOT NULL,
    actor_username TEXT NOT NULL DEFAULT '',
    actor_role TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL DEFAULT 200,
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events (created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_username, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS audit_events_request_idx ON audit_events (request_id)');
}

async function record(event) {
  await pool.query(`INSERT INTO audit_events
    (request_id, actor_username, actor_role, event_type, method, path, status_code, ip_address, user_agent, duration_ms, details)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
    event.requestId || '', event.actorUsername || '', event.actorRole || '', event.eventType || 'request',
    event.method || '', event.path || '', Number(event.statusCode) || 500, event.ipAddress || '',
    event.userAgent || '', Number(event.durationMs) || 0, JSON.stringify(event.details || {})
  ]);
}

async function list({ limit = 100, offset = 0, actor = '', eventType = '' } = {}) {
  const values = [];
  const filters = [];
  if (actor) { values.push(String(actor)); filters.push(`actor_username = $${values.length}`); }
  if (eventType) { values.push(String(eventType)); filters.push(`event_type = $${values.length}`); }
  values.push(Math.min(500, Math.max(1, Number(limit) || 100)));
  values.push(Math.max(0, Number(offset) || 0));
  const result = await pool.query(`SELECT id, request_id AS "requestId", actor_username AS "actorUsername", actor_role AS "actorRole", event_type AS "eventType", method, path, status_code AS "statusCode", ip_address AS "ipAddress", user_agent AS "userAgent", duration_ms AS "durationMs", details, created_at AS "createdAt" FROM audit_events ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  return result.rows;
}

module.exports = { ensureStore, record, list };