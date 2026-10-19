// Clients without browser headers remain compatible. SameSite is defense in depth.
function createRequestOriginGuard({ secure = false } = {}) {
  return (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const deny = () => res.status(403).json({ error: 'Invalid request origin' });
    if (req.get('sec-fetch-site') === 'cross-site') return deny();
    const origin = req.get('origin');
    const source = origin || req.get('referer');
    if (!source) return next();
    try {
      const expected = new URL(`${secure ? 'https' : req.protocol}://${req.get('host')}`);
      const actual = new URL(source);
      if (actual.origin !== expected.origin || actual.username || actual.password) return deny();
      if (origin && actual.href !== `${actual.origin}/`) return deny();
    } catch {
      return deny();
    }
    return next();
  };
}
module.exports = { createRequestOriginGuard };
