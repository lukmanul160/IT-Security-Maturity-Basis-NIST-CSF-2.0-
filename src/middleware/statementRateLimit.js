const { createHash } = require('node:crypto');
function createLimit({ limit = 30, windowMs = 60000, key = req => req.ip } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [id, bucket] of buckets) if (bucket.until <= now) buckets.delete(id);
    const id = createHash('sha256').update(String(key(req))).digest('hex');
    const bucket = buckets.get(id) || { count: 0, until: now + windowMs };
    if (bucket.count >= limit || (!buckets.has(id) && buckets.size >= 10000)) return res.status(429).set('Retry-After', String(Math.ceil((bucket.until - now) / 1000))).json({ error: 'Terlalu banyak permintaan. Coba kembali satu menit lagi.' });
    bucket.count++; buckets.set(id, bucket); next();
  };
}
module.exports = { createLimit };
