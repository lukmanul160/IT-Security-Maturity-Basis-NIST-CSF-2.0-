const { pool } = require('../config/database');

const permissions = [
  ['framework', 'Choose framework'], ['csf', 'CSF 2.0'], ['privacy', 'Privacy Framework'],
  ['assessment', 'CSF assessment'], ['privacy-assessment', 'Privacy assessment'],
  ['risk-acceptance', 'Risk Acceptance'], ['risk-management', 'Risk Management'],
  ['files', 'Uploaded files'], ['account', 'Account Management']
];
const defaults = { admin: permissions.map(([key]) => key), user: ['framework', 'csf', 'privacy', 'assessment', 'privacy-assessment', 'risk-acceptance', 'risk-management', 'account'] };

async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS role_permissions (role TEXT NOT NULL CHECK (role IN ('admin', 'user')), permission_key TEXT NOT NULL, allowed BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (role, permission_key))`);
  for (const role of ['admin', 'user']) for (const [key] of permissions) await pool.query('INSERT INTO role_permissions (role, permission_key, allowed) VALUES ($1, $2, $3) ON CONFLICT (role, permission_key) DO NOTHING', [role, key, defaults[role].includes(key)]);
}
async function list() { const result = await pool.query('SELECT role, permission_key AS "permissionKey", allowed FROM role_permissions ORDER BY role, permission_key'); return result.rows; }
async function getRolePermissions(role) { if (role === 'admin') return permissions.map(([permissionKey]) => permissionKey); const result = await pool.query('SELECT permission_key FROM role_permissions WHERE role = $1 AND allowed = TRUE', [role]); return result.rows.map(row => row.permission_key); }
async function has(role, key) { if (role === 'admin') return true; const result = await pool.query('SELECT allowed FROM role_permissions WHERE role = $1 AND permission_key = $2', [role, key]); return Boolean(result.rows[0]?.allowed); }
async function update(role, data) { if (!['admin', 'user'].includes(role) || !Array.isArray(data?.permissions)) throw Object.assign(new Error('Role and permissions are required'), { status: 400 }); const allowed = new Set(data.permissions); for (const [key] of permissions) await pool.query('UPDATE role_permissions SET allowed = $1, updated_at = NOW() WHERE role = $2 AND permission_key = $3', [role === 'admin' || allowed.has(key), role, key]); return getRolePermissions(role); }
module.exports = { permissions, ensureStore, list, getRolePermissions, has, update };