const { pool } = require('../config/database');

const permissions = [
  ['framework', 'Choose framework'], ['csf', 'CSF 2.0'], ['privacy', 'Privacy Framework'],
  ['assessment', 'CSF assessment'], ['privacy-assessment', 'Privacy assessment'],
  ['risk-acceptance', 'Risk Acceptance'], ['risk-management', 'Risk Management'], ['personnel-certification', 'Personnel Certification'], ['tprm', 'Third-Party Risk Management'], ['tprm-tiering', 'Vendor Tiering Matrix'], ['tprm-questionnaire', 'Due Diligence Questionnaire'], ['questionnaire-templates', 'Questionnaire Templates'], ['tprm-register', 'TPRM Risk Register'],
  ['files', 'Uploaded files'], ['account', 'Account Management']
];
const validRoles = ['admin', 'approver', 'editor', 'viewer', 'user'];
const defaults = {
  admin: permissions.map(([key]) => key),
  approver: ['framework', 'csf', 'privacy', 'assessment', 'privacy-assessment', 'risk-acceptance', 'risk-management', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'questionnaire-templates', 'tprm-register', 'files'],
  editor: ['framework', 'csf', 'privacy', 'assessment', 'privacy-assessment', 'risk-acceptance', 'risk-management', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'questionnaire-templates', 'tprm-register', 'files', 'account'],
  viewer: ['framework', 'csf', 'privacy', 'assessment', 'privacy-assessment', 'risk-acceptance', 'risk-management', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'tprm-register'],
  user: ['framework', 'csf', 'privacy', 'assessment', 'privacy-assessment', 'risk-acceptance', 'risk-management', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'questionnaire-templates', 'tprm-register', 'files', 'account']
};

async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS role_permissions (role TEXT NOT NULL CHECK (role IN ('admin', 'approver', 'editor', 'viewer', 'user')), permission_key TEXT NOT NULL, allowed BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (role, permission_key))`);
  await pool.query(`ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check`);
  await pool.query(`ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check CHECK (role IN ('admin', 'approver', 'editor', 'viewer', 'user'))`);
  for (const role of validRoles) for (const [key] of permissions) await pool.query('INSERT INTO role_permissions (role, permission_key, allowed) VALUES ($1, $2, $3) ON CONFLICT (role, permission_key) DO NOTHING', [role, key, defaults[role].includes(key)]);
}
async function list() { const result = await pool.query('SELECT role, permission_key AS "permissionKey", allowed FROM role_permissions ORDER BY role, permission_key'); return result.rows; }
async function getRolePermissions(role) { if (role === 'admin') return permissions.map(([permissionKey]) => permissionKey); const result = await pool.query('SELECT permission_key FROM role_permissions WHERE role = $1 AND allowed = TRUE', [role]); return result.rows.map(row => row.permission_key); }
async function has(role, key) { if (role === 'admin') return true; const result = await pool.query('SELECT allowed FROM role_permissions WHERE role = $1 AND permission_key = $2', [role, key]); return Boolean(result.rows[0]?.allowed); }
async function update(role, data) { if (!validRoles.includes(role) || !Array.isArray(data?.permissions)) throw Object.assign(new Error('Role and permissions are required'), { status: 400 }); const allowed = new Set(data.permissions); for (const [key] of permissions) await pool.query('UPDATE role_permissions SET allowed = $1, updated_at = NOW() WHERE role = $2 AND permission_key = $3', [role === 'admin' || allowed.has(key), role, key]); return getRolePermissions(role); }
module.exports = { permissions, roles: validRoles, defaults, ensureStore, list, getRolePermissions, has, update };