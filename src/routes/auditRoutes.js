const express = require('express');
const auditService = require('../services/auditService');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();
router.get('/', requireAdmin, async (req, res, next) => {
  try { res.json(await auditService.list(req.query)); } catch (error) { next(error); }
});

// Browser-generated transfers are declarations; database mutations are logged separately.
router.post('/activity', async (req, res) => {
  const { action, module, filename, count, outcome, message, error } = req.body || {};
  if (!['export', 'import', 'report', 'download'].includes(action) || typeof module !== 'string' || module.length > 100 || (filename != null && (typeof filename !== 'string' || filename.length > 255))) return res.status(400).json({ error: 'Aktivitas tidak valid' });
  if (!['initiated', 'success', 'failed'].includes(outcome) || [message, error].some(value => value != null && (typeof value !== 'string' || value.length > 2000))) return res.status(400).json({ error: 'Hasil aktivitas tidak valid' });
  req.auditDetails = { action: `data.${action}`, module, filename, count: Number.isSafeInteger(count) && count >= 0 ? count : undefined, outcome, message, error, source: 'browser-declared' };
  try {
    await auditService.record({ requestId: req.requestId, actorUsername: req.user.username, actorRole: req.user.role,
      eventType: `data.${action}`, method: req.method, path: '/api/audit/activity', statusCode: 204,
      ipAddress: req.ip, userAgent: req.get('user-agent'), details: require('../middleware/audit').sanitize(req.auditDetails) });
    req.auditRecorded = true;
    res.status(204).end();
  } catch (error) {
    console.error('[audit] Transfer persistence failed:', error.message);
    res.status(503).json({ error: 'Audit trail tidak dapat disimpan ke database. Periksa koneksi database atau tabel audit_events.', requestId: req.requestId });
  }
});
module.exports = router;
