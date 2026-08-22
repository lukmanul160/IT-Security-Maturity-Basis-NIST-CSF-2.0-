const { authenticate, createSession, destroySession, parseCookies, sessionCookie } = require('../config/auth');

async function login(req, res) {
  const { username, password } = req.body || {};
  const user = await authenticate(username, password);
  if (!user) return res.status(401).json({ error: 'Username atau password salah' });
  const token = createSession(user);
  res.cookie(sessionCookie, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60 * 1000 });
  return res.json({ username: user.username, role: user.role });
}
function logout(req, res) { destroySession(parseCookies(req.headers.cookie)[sessionCookie]); res.clearCookie(sessionCookie); res.status(204).end(); }
function currentUser(req, res) { res.json(req.user); }

module.exports = { login, logout, currentUser };
