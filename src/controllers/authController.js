/**
 * Adapter HTTP: authController.
 * Baca req, delegasikan kasus penggunaan ke service, lalu bentuk response/error. Aturan domain dan transaksi tetap di service.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const { authenticate, createSession, destroySession, parseCookies, sessionCookie } = require('../config/auth');
const accountService = require('../services/accountService');
const permissionService = require('../services/permissionService');
const { sessionCookieSecure } = require('../config/env');
const { state } = require('../services/authStateService');
async function login(req, res) {
  const { username, password } = req.body || {};
  const key = `${req.ip}|${String(username || '').trim().toLowerCase()}`;
  const attempt = await state.consume('login-account', key, 5, 15*60*1000);
  if (!attempt.allowed) { res.set('Retry-After',String(attempt.retryAfter)); return res.status(429).json({error:'Terlalu banyak percobaan login. Coba lagi nanti.'}); }
  const user = await authenticate(username,password);
  if (!user) return res.status(401).json({error:'Username atau password salah'});
  const token = await createSession(user);
  await state.reset('login-account',key);
  req.user = {username:user.username,role:user.role};
  res.cookie(sessionCookie,token,{httpOnly:true,sameSite:'lax',secure:sessionCookieSecure,maxAge:8*60*60*1000});
  return res.json(req.user);
}
async function logout(req,res) { await destroySession(parseCookies(req.headers.cookie)[sessionCookie]);res.clearCookie(sessionCookie);res.status(204).end(); }
async function currentUser(req, res) { const profile = await accountService.getProfile(req.user.username); profile.actions = await permissionService.getRoleActions(profile.role); profile.ownEvidenceDelete = await permissionService.canDeleteOwnedEvidence(profile.role); profile.permissions = Object.keys(profile.actions).filter(key=>profile.actions[key].read); res.json(profile); }
async function updateProfile(req, res) { const data = req.body || {}; if (req.user.role !== 'admin' && Object.keys(data).some(field => field !== 'fullName')) return res.status(403).json({ error: 'Only administrators can change account security settings' }); res.json(await accountService.updateProfile(req.user.username, data)); }
async function updatePassword(req, res) { res.json(await accountService.updatePassword(req.user.username, req.body || {})); }
async function listUsers(req, res) { res.json(await accountService.listUsers()); }
async function createUser(req, res) { res.status(201).json(await accountService.createUser(req.body || {})); }
async function updateUser(req, res) { res.json(await accountService.updateUser(req.params.id, req.body || {})); }
async function deleteUser(req, res) { await accountService.deleteUser(req.params.id, req.user.username); res.status(204).end(); }
async function listPermissions(req, res) { res.json({ permissions: permissionService.permissions, assignments: await permissionService.list() }); }
async function updatePermissions(req, res) { res.json(await permissionService.update(req.params.role, req.body || {})); }

module.exports = { login, logout, currentUser, updateProfile, updatePassword, listUsers, createUser, updateUser, deleteUser, listPermissions, updatePermissions };
