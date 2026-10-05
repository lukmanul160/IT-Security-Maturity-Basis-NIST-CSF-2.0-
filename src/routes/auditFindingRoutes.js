const router = require('express').Router();
const multer = require('multer');
const service = require('../services/auditFindingService');
const { requirePermission, requirePageAccess } = require('../middleware/permission');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 10, fields: 12, fieldSize: 20000 } });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const reminder = require('../services/auditFindingReminderService');
const { requireAdmin } = require('../middleware/authorization');
router.get('/reminder-settings', requireAdmin, wrap(async (req, res) => res.json(await reminder.getSettings())));
router.put('/reminder-settings', requireAdmin, wrap(async (req, res) => res.json(await reminder.saveSettings(req.body))));
router.post('/reminder-settings/test', requireAdmin, wrap(async (req, res) => res.json(await reminder.testEmail(req.body?.to))));
router.param('id', (req, res, next, id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? next() : res.status(400).json({ error: 'ID tidak valid' }));
router.get('/', requirePermission('audit-finding-tracker', 'read'), wrap(async (req, res) => res.json(await service.list(req.user))));
router.get('/available-files', async (req,res,next) => { const permissions=require('../services/permissionService'); if(await permissions.has(req.user?.role,'audit-finding-tracker','create') || await permissions.has(req.user?.role,'audit-finding-tracker','update')) return next(); res.status(403).json({error:'Access denied for audit attachments'}); }, wrap(async (req, res) => {
  const access = require('../services/evidenceAccessService');
  const files = await access.searchableList(req.user);
  res.set('Cache-Control','no-store').json(files.map(file => ({path:access.normalize(file.path),name:file.name,source:file.source,policyDetails:file.policyDetails})));
}));
router.get('/:id/download', requirePermission('audit-finding-tracker', 'read'), wrap(async (req, res) => {
  const file = await service.download(req.params.id, req.user, req.query.path);
  res.set('Cache-Control', 'no-store').attachment(file.filename).type('application/octet-stream').send(file.content);
}));
router.post('/', requirePageAccess('audit-finding-tracker', 'create'), upload.array('file',10), wrap(async (req, res) => res.status(201).json(await service.save(req.body.kind, null, req.body.parentId, req.body, req.files, req.user))));
router.put('/:id', requirePageAccess('audit-finding-tracker', 'update'), upload.array('file',10), wrap(async (req, res) => res.json(await service.save(req.body.kind, req.params.id, null, req.body, req.files, req.user))));
router.delete('/:id', requirePageAccess('audit-finding-tracker', 'delete'), wrap(async (req, res) => { await service.remove(req.params.id, req.user); res.status(204).end(); }));
router.use((error, req, res, next) => error instanceof multer.MulterError ? res.status(400).json({ error: 'Upload tidak valid. Maksimum 10 file, masing-masing 10 MB.' }) : next(error));
module.exports = router;
