const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('./database');
const sessions = new Map();
const sessionCookie = 'nist_session';

async function authenticate(username, password) { if (typeof username !== 'string' || typeof password !== 'string') return null; const result = await pool.query('SELECT username, password_hash, role FROM app_users WHERE username = $1', [username]); const user = result.rows[0]; if (!user || !(await bcrypt.compare(password, user.password_hash))) return null; return { username: user.username, role: user.role }; }
function createSession(user) { const token = crypto.randomBytes(32).toString('hex'); sessions.set(token, { username: user.username, role: user.role, createdAt: Date.now() }); return token; }
function getSession(token) { return token ? sessions.get(token) : null; }
function destroySession(token) { if (token) sessions.delete(token); }
function parseCookies(header = '') { return Object.fromEntries(header.split(';').map(value => value.trim().split('=').map(decodeURIComponent)).filter(([key, value]) => key && value)); }

module.exports = { authenticate, createSession, getSession, destroySession, parseCookies, sessionCookie };
