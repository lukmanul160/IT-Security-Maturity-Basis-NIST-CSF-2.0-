const permissionService = require('../services/permissionService');
function requirePermission(key, action = 'read') { return async (req, res, next) => { if (permissionService.canAccess(req.user?.role, key, action) || await permissionService.has(req.user?.role, key, action)) return next(); return res.status(403).json({ error: `Access denied for ${key} (${action})` }); }; }
function requirePageAccess(key, action = 'read') { return requirePermission(key, action); }
module.exports = { requirePermission, requirePageAccess };