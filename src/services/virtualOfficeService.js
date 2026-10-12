const { pool } = require('../config/database');
const { getOfficeSessions } = require('../config/auth');
const { permissions } = require('./permissionService');
const labels = Object.fromEntries(permissions);
labels.backups = 'Administration';
async function snapshot() {
  const { rows } = await pool.query('SELECT id, username, full_name, role FROM app_users ORDER BY id');
  const sessions = getOfficeSessions();
  const names = rows.filter(row => sessions.has(row.username)).map(row => row.username);
  const activityByUser = new Map();
  if (names.length) {
    const result = await pool.query(`SELECT active.username, event.event_type, event.path, event.status_code, event.created_at
      FROM unnest($1::text[], $2::timestamptz[]) AS active(username, started_at)
      LEFT JOIN LATERAL (
        SELECT event_type, path, status_code, created_at FROM audit_events
        WHERE actor_username = active.username AND created_at >= active.started_at
        AND path <> ALL($3::text[]) AND path NOT LIKE '/api/health%'
        ORDER BY created_at DESC, id DESC LIMIT 1
      ) event ON true`, [names, names.map(name => new Date(sessions.get(name).createdAt).toISOString()),
        ['/api/auth/me', '/api/office-presence', '/api/public/virtual-office', '/api/reminders', '/api/storage-settings/capacity']]);
    result.rows.forEach(event => activityByUser.set(event.username, event));
  }
  return {
    updatedAt: new Date().toISOString(), capacity: Math.max(30, rows.length),
    users: rows.map(row => {
      const role = ['admin', 'approver', 'editor', 'viewer', 'user'].includes(row.role) ? row.role : 'user';
      const session = sessions.get(row.username);
      return { id: row.id, role, name: row.full_name?.trim() || row.username, online: Boolean(session), activity: session ? describeActivity(activityByUser.get(row.username)) : 'Aktivitas santai (simulasi)', activityAt: session && activityByUser.get(row.username)?.created_at ? new Date(activityByUser.get(row.username).created_at).toISOString() : null };
    }),
  };
}
function describeActivity(event) {
  if (!event?.event_type) return 'Signed in. No activity has been recorded yet.';
  const module = (event.path || '').split('/')[2];
  const subjects = { auth: event.path?.startsWith('/api/auth/users') ? 'user accounts' : 'account settings',
    'monitoring-dashboard': 'the monitoring dashboard', 'asset-management': 'the asset inventory',
    'knowledge-notes': 'knowledge notes', 'threat-modelling': 'threat models',
    'audit-finding-tracker': 'audit findings', assessment: 'assessments', 'assessment-gaps': 'assessment gaps',
    files: 'files', csf: 'cybersecurity assessments', privacy: 'privacy assessments', frameworks: 'frameworks',
    'risk-acceptance': 'risk acceptance records', 'risk-management': 'risk records',
    'personnel-certifications': 'staff certifications', tprm: 'third-party assessments',
    'policy-register': 'policies', audit: 'the activity log', backups: 'backups', 'file-backups': 'file backups' };
  const subject = subjects[module] || 'workspace records';
  if (event.event_type === 'auth.login') return 'Signed in to the workspace.';
  if (event.status_code >= 400 || event.event_type === 'request.error') return `An attempt to access ${subject} was unsuccessful.`;
  const verbs = { 'data.read': 'Viewing', 'data.create': 'Creating', 'data.update': 'Updating', 'data.delete': 'Deleting',
    'data.import': 'Importing', 'data.export': 'Exporting', 'data.report': 'Generating a report for',
    'file.upload': 'Uploading', 'file.download': 'Downloading', 'file.delete': 'Deleting' };
  return `${verbs[event.event_type] || 'Working with'} ${subject}.`;
}
module.exports = { snapshot, labels, describeActivity };
