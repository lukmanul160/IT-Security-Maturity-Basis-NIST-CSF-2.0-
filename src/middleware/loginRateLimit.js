// Limit all attempts per peer, including rotating usernames and successful logins.
function createLoginRateLimit({ limit = 30, windowMs = 15 * 60 * 1000, maxPeers = 10000, now = Date.now, key } = {}) {
  const peers = new Map();
  return (req, res, next) => {
    const time = now();
    for (const [peer, record] of peers) {
      if (record.expires <= time) peers.delete(peer);
    }
    const peer = key ? key(req) : req.ip || req.socket?.remoteAddress || 'unknown';
    let record = peers.get(peer);
    if (!record) {
      if (peers.size >= maxPeers) return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi nanti.' });
      record = { count: 0, expires: time + windowMs };
      peers.set(peer, record);
    }
    if (++record.count > limit) {
      res.set('Retry-After', String(Math.ceil((record.expires - time) / 1000)));
      return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi nanti.' });
    }
    return next();
  };
}
module.exports = { createLoginRateLimit };
