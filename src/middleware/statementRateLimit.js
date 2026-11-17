/**
 * Middleware Express: statementRateLimit.
 * Alur request harus meneruskan next atau menyelesaikan response secara tepat; error tetap mengikuti pipeline Express.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const { state } = require('../services/authStateService');
function createLimit({ limit = 30, windowMs = 60000, namespace = 'statement-request', key = req => req.ip } = {}) {
  return async (req, res, next) => {
    const result = await state.consume(namespace, String(key(req)), limit, windowMs);
    if (!result.allowed) return res.status(429).set('Retry-After', String(result.retryAfter)).json({ error: 'Terlalu banyak permintaan. Coba kembali satu menit lagi.' });
    return next();
  };
}
module.exports = { createLimit };
