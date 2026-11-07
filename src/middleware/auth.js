/**
 * Middleware Express: auth.
 * Alur request harus meneruskan next atau menyelesaikan response secara tepat; error tetap mengikuti pipeline Express.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const { getSession, parseCookies, sessionCookie } = require('../config/auth');

function requireAuth(req, res, next) {
  const session = getSession(parseCookies(req.headers.cookie)[sessionCookie]);
  if (!session) {
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Authentication required' });
    return res.redirect('/login');
  }
  req.user = session;
  res.set('Cache-Control', 'no-store');
  next();
}

module.exports = { requireAuth };
