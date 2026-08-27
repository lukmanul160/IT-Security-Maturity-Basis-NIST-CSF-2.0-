const permissionService = require('../services/permissionService');
function requirePermission(key) { return async (req, res, next) => { if (await permissionService.has(req.user?.role, key)) return next(); return res.status(403).json({ error: `Access denied for ${key}` }); }; }
module.exports = { requirePermission };