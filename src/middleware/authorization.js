const fs = require('fs').promises;
const csfFunctions = new Set(['Govern', 'Identify', 'Protect', 'Detect', 'Respond', 'Recover']);

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
  next();
}

async function requireCsfFileAccess(req, res, next) {
  if (req.user?.role === 'admin') return next();
  if (req.method === 'POST' && (csfFunctions.has(req.body?.functionName) || /^[A-Z]+-P$/.test(req.body?.functionName || ''))) return next();
  if (req.method === 'GET' || req.method === 'DELETE') {
    const filePath = Array.isArray(req.params.path) ? req.params.path.join('/') : String(req.params.path || '');
    if (csfFunctions.has(filePath.split('/')[0]) || /^[A-Z]+-P$/.test(filePath.split('/')[0])) return next();
  }
  const uploadedFiles = req.file ? [req.file] : req.files || [];
  await Promise.all(uploadedFiles.map(file => fs.rm(file.path, { force: true })));
  return res.status(403).json({ error: 'CSF assessment access required' });
}

module.exports = { requireAdmin, requireCsfFileAccess };
