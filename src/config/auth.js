/** Shared PostgreSQL authentication; public session operations return promises. */
const bcrypt = require('bcryptjs');
const { pool } = require('./database');
const { state, restoreLock } = require('../services/authStateService');
const sessionCookie = 'nist_session';
let restoreClient;
async function authenticate(username, password) {
  if (await state.restoring()) return null;
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  if (!/^[a-zA-Z0-9._-]{3,50}$/.test(username) || Buffer.byteLength(password, 'utf8') > 72) return null;
  const user = (await pool.query('SELECT username,password_hash,role FROM app_users WHERE username=$1', [username])).rows[0];
  const dummy = '$2b$12$f0T2r3sXfXLj7PQg1h7caeiRKR60H3EhfbqynU/iAmXcVSTtn4v5a';
  if (!(await bcrypt.compare(password, user?.password_hash || dummy)) || !user || await state.restoring()) return null;
  return { username: user.username, role: user.role, credentialHash: user.password_hash };
}
const createSession = user => state.create(user);
const getSession = token => state.get(token);
const destroySession = token => state.remove(token);
const destroyUserSessions = username => state.removeUser(username);
const getOfficeSessions = () => state.office();
const updateOfficePresence = (token, module) => state.presence(token, module);
function parseCookies(header = '') {
	const cookies = {};

	for (const value of String(header).split(';')) {
		const separator = value.indexOf('=');
		if (separator < 1) continue;

		try {
			const key = decodeURIComponent(value.slice(0, separator).trim());
			const cookieValue = decodeURIComponent(value.slice(separator + 1).trim());
			if (key) cookies[key] = cookieValue;
		} catch (error) {
			continue;
		}
	}

	return cookies;
}


async function beginDatabaseRestore() {
  if (restoreClient) throw Object.assign(new Error('Database restore sedang berlangsung.'), {status:409});
  const client = await pool.connect();
  try {
    if (!(await client.query('SELECT pg_try_advisory_lock($1) AS locked',[restoreLock])).rows[0].locked)
      throw Object.assign(new Error('Database restore sedang berlangsung.'), {status:409});
    restoreClient = client;
    await client.query('DELETE FROM auth_sessions');
    require('../services/redisCacheService').invalidateDashboard();
  } catch(error) {
    if (restoreClient === client) { restoreClient=undefined; await client.query('SELECT pg_advisory_unlock($1)',[restoreLock]); }
    client.release(); throw error;
  }
}
async function endDatabaseRestore() {
  const client=restoreClient;
  if (!client) return;
  // Old backups may predate the ledger. Apply forward migrations before reopening access.
  // Keep the lock held if recovery fails; restored sessions must never become valid.
  await require('../services/migrationService').migrate(pool);
  await client.query('DELETE FROM auth_sessions; DELETE FROM auth_rate_limits');
  require('../services/redisCacheService').invalidateDashboard();
  await client.query('SELECT pg_advisory_unlock($1)',[restoreLock]);
  restoreClient=undefined;
  client.release();
}
module.exports={authenticate,createSession,getSession,destroySession,destroyUserSessions,parseCookies,sessionCookie,beginDatabaseRestore,endDatabaseRestore,getOfficeSessions,updateOfficePresence};
