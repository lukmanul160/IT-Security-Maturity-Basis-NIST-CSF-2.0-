const { authenticate, createSession, destroySession, parseCookies, sessionCookie } = require('../config/auth');
const accountService = require('../services/accountService');

async function login(req, res) {
  const { username, password } = req.body || {};
  const user = await authenticate(username, password);
  if (!user) return res.status(401).json({ error: 'Username atau password salah' });
  const token = createSession(user);
  res.cookie(sessionCookie, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 });
  return res.json({ username: user.username, role: user.role });
}
function logout(req, res) { destroySession(parseCookies(req.headers.cookie)[sessionCookie]); res.clearCookie(sessionCookie); res.status(204).end(); }
async function currentUser(req, res) { res.json(await accountService.getProfile(req.user.username)); }
async function updateProfile(req, res) { const data = req.body || {}; if (req.user.role !== 'admin' && Object.keys(data).some(field => field !== 'fullName')) return res.status(403).json({ error: 'Only administrators can change account security settings' }); res.json(await accountService.updateProfile(req.user.username, data)); }
async function updatePassword(req, res) { res.json(await accountService.updatePassword(req.user.username, req.body || {})); }
async function listUsers(req, res) { res.json(await accountService.listUsers()); }
async function createUser(req, res) { res.status(201).json(await accountService.createUser(req.body || {})); }
async function updateUser(req, res) { res.json(await accountService.updateUser(req.params.id, req.body || {})); }
async function deleteUser(req, res) { await accountService.deleteUser(req.params.id, req.user.username); res.status(204).end(); }

module.exports = { login, logout, currentUser, updateProfile, updatePassword, listUsers, createUser, updateUser, deleteUser };
