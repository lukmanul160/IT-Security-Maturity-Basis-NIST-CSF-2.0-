const crypto = require('crypto');
const auditService = require('../services/auditService');

function auditRequest(req, res, next) {
  const requestId = req.get('x-request-id') || crypto.randomUUID();
  const startedAt = Date.now();
  req.requestId = requestId;
  res.set('X-Request-Id', requestId);
  res.on('finish', () => {
    const isError = res.statusCode >= 400;
    auditService.record({
      requestId, actorUsername: req.user?.username, actorRole: req.user?.role,
      eventType: isError ? 'request.error' : (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? 'data.mutation' : 'request'),
      method: req.method, path: req.originalUrl.split('?')[0], statusCode: res.statusCode,
      ipAddress: req.ip, userAgent: req.get('user-agent'), durationMs: Date.now() - startedAt,
      details: isError ? { error: res.statusMessage || 'Request failed' } : {}
    }).catch(error => console.error('[audit] Unable to record event:', error.message));
  });
  next();
}

module.exports = { auditRequest };