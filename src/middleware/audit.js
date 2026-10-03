const crypto = require('crypto');
const auditService = require('../services/auditService');
const { getSession, parseCookies, sessionCookie } = require('../config/auth');

function sanitize(value, depth = 0) {
  if (depth > 5) return '[truncated]';
  if (typeof value === 'string') return value.slice(0, 2000);
  if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitize(item, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, /password|secret|token|cookie|authorization|credential|private.?key|api.?key|content|buffer/i.test(key) ? '[redacted]' : sanitize(item, depth + 1)]));
  return value;
}
function classify(req, res) {
  const path = req.originalUrl.split('?')[0];
  if (/\/auth\/login$/.test(path)) return 'auth.login';
  if (/\/auth\/logout$/.test(path)) return 'auth.logout';
  if (/\/import(?:\/|$)/.test(path)) return 'data.import';
  if (/\/export(?:\/|$)/.test(path)) return 'data.export';
  if (/\/report(?:\/|$)/.test(path)) return 'data.report';
  if (req.file || req.files?.length) return 'file.upload';
  if (req.method === 'GET' && (res.getHeader('content-disposition') || /\/download(?:\/|$)/.test(path))) return 'file.download';
  if (req.method === 'DELETE') return path.startsWith('/api/files/') ? 'file.delete' : 'data.delete';
  if (req.method === 'POST') return 'data.create';
  if (['PUT', 'PATCH'].includes(req.method)) return 'data.update';
  return 'data.read';
}
function auditRequest(req, res, next) {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const initialActor = req.user || getSession(parseCookies(req.headers.cookie)[sessionCookie]);
  req.requestId = requestId;
  res.set('X-Request-Id', requestId);
  let responseDetails;
  const json = res.json;
  res.json = function (body) { responseDetails = sanitize(body); return json.call(this, body); };
  let recorded = false;
  function record(aborted = false) {
    if (recorded || req.auditRecorded) return;
    recorded = true;
    const actor = req.user || initialActor;
    const action = req.auditDetails?.action || classify(req, res);
    const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
    auditService.record({
      requestId, actorUsername: actor?.username, actorRole: actor?.role,
      eventType: aborted || res.statusCode >= 400 ? 'request.error' : action,
      method: req.method, path: req.originalUrl.split('?')[0], statusCode: aborted ? 499 : res.statusCode,
      ipAddress: req.ip, userAgent: req.get('user-agent'), durationMs: Date.now() - startedAt,
      details: sanitize({ action, outcome: aborted ? 'aborted' : res.statusCode >= 400 ? 'failed' : 'success',
        module: req.originalUrl.split('?')[0].split('/')[2], target: req.params, query: req.query,
        submitted: req.body, attemptedUsername: action === 'auth.login' ? req.body?.username : undefined,
        files: files.map(file => ({ name: file.originalname, size: file.size, mimeType: file.mimetype })),
        disposition: res.getHeader('content-disposition'), response: req.method !== 'GET' || res.statusCode >= 400 ? responseDetails : undefined,
        ...req.auditDetails, ...(aborted || res.statusCode >= 400 ? { outcome: aborted ? 'aborted' : 'failed', error: responseDetails?.error || 'Request failed' } : {}) })
    }).catch(error => console.error('[audit] Unable to record event:', error.message));
  }
  res.on('finish', () => record());
  res.on('close', () => { if (!res.writableFinished) record(true); });
  next();
}
module.exports = { auditRequest, sanitize, classify };
