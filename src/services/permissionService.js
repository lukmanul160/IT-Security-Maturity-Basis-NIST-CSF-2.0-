const { pool } = require('../config/database');

const permissions = [
  ['framework', 'Choose framework'], ['csf', 'CSF 2.0'], ['privacy', 'Privacy Framework'], ['iso27001', 'ISO 27001:2022'], ['iso27001-soa', 'SOA (Statement of Applicability)'],
  ['assessment', 'CSF assessment'], ['privacy-assessment', 'Privacy assessment'],
  ['risk-acceptance', 'Risk Acceptance'], ['audit-finding-tracker', 'Audit Finding Tracker'], ['risk-management', 'Risk Management'], ['policy-register', 'Policy Register'], ['personnel-certification', 'Personnel Certification'], ['tprm', 'Third-Party Risk Management'], ['tprm-tiering', 'Vendor Tiering Matrix'], ['tprm-questionnaire', 'Due Diligence Questionnaire'], ['questionnaire-templates', 'Questionnaire Templates'], ['tprm-register', 'TPRM Risk Register'],
  ['files', 'Uploaded files'], ['account', 'Account Management']
];
const validRoles = ['admin', 'approver', 'editor', 'viewer', 'user'];
const pageActionMatrix = {
  framework: { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'editor', 'user'], update: ['admin', 'editor', 'user'], delete: ['admin'] },
  csf: { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'editor', 'user'], update: ['admin', 'editor', 'user'], delete: ['admin'] },
  privacy: { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'editor', 'user'], update: ['admin', 'editor', 'user'], delete: ['admin'] },
  iso27001: { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'editor', 'user'], update: ['admin', 'editor', 'user'], delete: ['admin'] },
  'iso27001-soa': { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'editor', 'user'], update: ['admin', 'editor', 'user'], delete: ['admin'] },
  assessment: { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'editor', 'user'], update: ['admin', 'editor', 'user'], delete: ['admin'] },
  'privacy-assessment': { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'editor', 'user'], update: ['admin', 'editor', 'user'], delete: ['admin'] },
  'risk-acceptance': { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'approver', 'editor', 'user'], update: ['admin', 'approver', 'editor', 'user'], delete: ['admin', 'approver'] },
  'audit-finding-tracker': { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'approver', 'editor', 'user'], update: ['admin', 'approver', 'editor', 'user'], delete: ['admin', 'approver'] },
  'risk-management': { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'approver', 'editor', 'user'], update: ['admin', 'approver', 'editor', 'user'], delete: ['admin', 'approver'] },
  'policy-register': { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'approver', 'editor', 'user'], update: ['admin', 'approver', 'editor', 'user'], delete: ['admin', 'approver'] },
  'personnel-certification': { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'editor'], update: ['admin', 'editor'], delete: ['admin', 'editor'] },
  tprm: { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'approver', 'editor', 'user'], update: ['admin', 'approver', 'editor', 'user'], delete: ['admin', 'approver'] },
  'tprm-tiering': { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'approver', 'editor', 'user'], update: ['admin', 'approver', 'editor', 'user'], delete: ['admin', 'approver'] },
  'tprm-questionnaire': { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'approver', 'editor', 'user'], update: ['admin', 'approver', 'editor', 'user'], delete: ['admin', 'approver'] },
  'questionnaire-templates': { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'editor', 'user'], update: ['admin', 'editor', 'user'], delete: ['admin', 'editor'] },
  'tprm-register': { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'approver', 'editor', 'user'], update: ['admin', 'approver', 'editor', 'user'], delete: ['admin', 'approver'] },
  files: { read: ['admin', 'approver', 'editor', 'viewer', 'user'], create: ['admin', 'editor', 'user'], update: ['admin', 'editor', 'user'], delete: ['admin', 'editor'] },
  account: { read: ['admin'], create: ['admin'], update: ['admin'], delete: ['admin'] }
};
const defaults = {
  admin: permissions.map(([key]) => key),
  approver: ['framework', 'csf', 'privacy', 'iso27001', 'iso27001-soa', 'assessment', 'privacy-assessment', 'risk-acceptance', 'audit-finding-tracker', 'risk-management', 'policy-register', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'questionnaire-templates', 'tprm-register', 'files'],
  editor: ['framework', 'csf', 'privacy', 'iso27001', 'iso27001-soa', 'assessment', 'privacy-assessment', 'risk-acceptance', 'audit-finding-tracker', 'risk-management', 'policy-register', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'questionnaire-templates', 'tprm-register', 'files', 'account'],
  viewer: ['framework', 'csf', 'privacy', 'iso27001', 'iso27001-soa', 'assessment', 'privacy-assessment', 'risk-acceptance', 'audit-finding-tracker', 'risk-management', 'policy-register', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'tprm-register'],
  user: ['framework', 'csf', 'privacy', 'iso27001', 'iso27001-soa', 'assessment', 'privacy-assessment', 'risk-acceptance', 'audit-finding-tracker', 'risk-management', 'policy-register', 'personnel-certification', 'tprm', 'tprm-tiering', 'tprm-questionnaire', 'questionnaire-templates', 'tprm-register', 'files', 'account']
};

function normalizeAction(action) {
  const value = String(action || 'read').toLowerCase();
  if (['create', 'post', 'new'].includes(value)) return 'create';
  if (['update', 'put', 'patch', 'edit'].includes(value)) return 'update';
  if (['delete', 'remove', 'destroy'].includes(value)) return 'delete';
  return 'read';
}

function canAccess(role, key, action = 'read') {
  if (!validRoles.includes(role)) return false;
  if (role === 'admin') return true;
  const page = pageActionMatrix[key];
  if (!page) return false;
  const normalizedAction = normalizeAction(action);
  const allowedRoles = page[normalizedAction] || page.read || [];
  return allowedRoles.includes(role);
}

async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS role_permissions (role TEXT NOT NULL CHECK (role IN ('admin', 'approver', 'editor', 'viewer', 'user')), permission_key TEXT NOT NULL, allowed BOOLEAN NOT NULL DEFAULT TRUE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (role, permission_key))`);
  await pool.query('ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS actions JSONB');
  await pool.query(`ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check`);
  await pool.query(`ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_check CHECK (role IN ('admin', 'approver', 'editor', 'viewer', 'user'))`);
  for (const role of validRoles) for (const [key] of permissions) await pool.query('INSERT INTO role_permissions (role, permission_key, allowed) VALUES ($1, $2, $3) ON CONFLICT (role, permission_key) DO NOTHING', [role, key, defaults[role].includes(key)]);
}
const actions = ['read','create','update','delete'];
function defaultActions(role,key) {
  return Object.fromEntries(actions.map(action=>[action, role === 'admin' || (key === 'account' ? action === 'read' : key === 'personnel-certification' && role === 'user' && action === 'create' ? true : key === 'files' && ['read','update','delete'].includes(action) ? true : canAccess(role,key,action))]));
}
function effectiveActions(role,key,row) {
  const base = {...defaultActions(role,key),...(row?.actions || {})};
  if (role === 'admin') return Object.fromEntries(actions.map(action=>[action,true]));
  if (key === 'account') for(const action of ['create','update','delete']) base[action]=false;
  return Object.fromEntries(actions.map(action=>[action,Boolean(row?.allowed && base.read && base[action])]));
}
async function list() {
  const result=await pool.query('SELECT role, permission_key AS "permissionKey", allowed, actions FROM role_permissions ORDER BY role, permission_key');
  return result.rows.map(row=>({...row,actions:effectiveActions(row.role,row.permissionKey,row)}));
}
async function getRoleActions(role) {
  const result=role === 'admin' ? {rows:[]} : await pool.query('SELECT permission_key, allowed, actions FROM role_permissions WHERE role=$1',[role]);
  return Object.fromEntries(permissions.map(([key])=>[key,effectiveActions(role,key,result.rows.find(row=>row.permission_key===key))]));
}
async function getRolePermissions(role) { const values=await getRoleActions(role); return Object.keys(values).filter(key=>values[key].read); }
async function has(role,key,action='read') {
  if(role==='admin') return true;
  if(!validRoles.includes(role) || !permissions.some(([value])=>value===key)) return false;
  const result=await pool.query('SELECT allowed, actions FROM role_permissions WHERE role=$1 AND permission_key=$2',[role,key]);
  return effectiveActions(role,key,result.rows[0])[normalizeAction(action)];
}
async function hasFileAction(role,action) {
  if(role==='admin')return true;
  if(!validRoles.includes(role))return false;
  const result=await pool.query("SELECT allowed, actions FROM role_permissions WHERE role=$1 AND permission_key='files'",[role]);
  // Preserve existing owner-only file access until action settings are configured.
  const row=result.rows[0];
  return row?.actions ? effectiveActions(role,'files',row)[normalizeAction(action)] : true;
}
async function canDeleteOwnedEvidence(role) {
  if(role!=='user')return false;
  const result=await pool.query("SELECT allowed, actions FROM role_permissions WHERE role=$1 AND permission_key='audit-finding-tracker'",[role]);
  return Boolean(result.rows[0]?.allowed && !result.rows[0]?.actions && await hasFileAction(role,'delete'));
}
async function update(role,data) {
  const invalid=message=>Object.assign(new Error(message),{status:400});
  if(!validRoles.includes(role) || !Array.isArray(data?.permissions))throw invalid('Role and permissions are required');
  const keys=new Set(permissions.map(([key])=>key));
  if(data.permissions.some(key=>!keys.has(key)))throw invalid('Unknown permission');
  if(data.actions !== undefined && (!data.actions || typeof data.actions !== 'object' || Array.isArray(data.actions)))throw invalid('Invalid permission actions');
  for(const [key,value] of Object.entries(data.actions || {})) {
    if(!keys.has(key) || !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(action=>!actions.includes(action)) || actions.some(action=>typeof value[action]!=='boolean'))throw invalid('Invalid action configuration');
    if(!value.read && actions.slice(1).some(action=>value[action]))throw invalid('Read access is required before enabling write actions');
    if(key==='account' && role!=='admin' && actions.slice(1).some(action=>value[action]))throw invalid('Account administration is admin-only');
  }
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    for(const [key] of permissions) {
      const override=data.actions?.[key];
      const allowed=role==='admin' || (data.permissions.includes(key) && (override?.read ?? true));
      if(override) await client.query('UPDATE role_permissions SET allowed=$1, actions=$2, updated_at=NOW() WHERE role=$3 AND permission_key=$4',[allowed,role==='admin' ? defaultActions(role,key) : override,role,key]);
      else await client.query('UPDATE role_permissions SET allowed=$1, updated_at=NOW() WHERE role=$2 AND permission_key=$3',[allowed,role,key]);
    }
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
  return getRolePermissions(role);
}
module.exports = { permissions, roles: validRoles, defaults, pageActionMatrix, actions, defaultActions, effectiveActions, canAccess, ensureStore, list, getRolePermissions, getRoleActions, has, hasFileAction, canDeleteOwnedEvidence, update };
