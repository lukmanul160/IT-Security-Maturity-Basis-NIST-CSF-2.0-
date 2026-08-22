const { getSession, parseCookies, sessionCookie } = require('../config/auth');

function requireAuth(req, res, next) {
  const session = getSession(parseCookies(req.headers.cookie)[sessionCookie]);
  if (!session) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Authentication required' });
    return res.redirect('/login');
  }
  req.user = session;
  next();
}

module.exports = { requireAuth };
