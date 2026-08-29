const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./database');
const sessions = new Map();
const sessionCookie = 'nist_session';
const sessionLifetime = 8 * 60 * 60 * 1000;

async function authenticate(username, password) {
	if (typeof username !== 'string' || typeof password !== 'string') return null;

	const result = await pool.query(
		'SELECT username, password_hash, role FROM app_users WHERE username = $1',
		[username]
	);
	const user = result.rows[0];
	if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;

	return { username: user.username, role: user.role };
}

function createSession(user) {
	const token = crypto.randomBytes(32).toString('hex');
	sessions.set(token, { username: user.username, role: user.role, createdAt: Date.now() });
	return token;
}

function getSession(token) {
	if (!token) return null;

	const session = sessions.get(token);
	if (!session) return null;

	if (Date.now() - session.createdAt >= sessionLifetime) {
		sessions.delete(token);
		return null;
	}

	return session;
}

function destroySession(token) {
	if (token) sessions.delete(token);
}

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

module.exports = { authenticate, createSession, getSession, destroySession, parseCookies, sessionCookie };
