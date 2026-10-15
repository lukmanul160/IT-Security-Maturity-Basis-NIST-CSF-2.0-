const router = require('express').Router();
const service = require('../services/complianceService');
const { requirePermission } = require('../middleware/permission');
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const reminderSettings = require('../services/complianceReminderSettingsService');
const reminderLink = require('../services/complianceReminderLinkService');
const { requireAdmin } = require('../middleware/authorization');
const multer = require('multer');
const evidence = require('../services/complianceEvidenceService');
const upload = multer({ storage: multer.memoryStorage(), limits: { files: 10, fileSize: 10 * 1024 * 1024, fields: 30, fieldSize: 20000 } });
router.get('/reports/reminder-settings', requireAdmin, wrap(async (req, res) => res.json(await reminderSettings.getSettings())));
router.put('/reports/reminder-settings', requireAdmin, wrap(async (req, res) => res.json(await reminderSettings.saveSettings(req.body))));
router.post('/reports/reminder-settings/test', requireAdmin, wrap(async (req, res) => res.json(await reminderSettings.testEmail(req.body?.to))));
router.param('id', (req, res, next, id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? next() : res.status(400).json({ error: 'ID tidak valid.' }));
router.param('fileId', (req, res, next, id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? next() : res.status(400).json({ error: 'ID file tidak valid.' }));
router.get('/reports/:id/files', requirePermission('reporting-regulator', 'read'), wrap(async (req, res) => res.json(await evidence.list(req.params.id))));
router.get('/reports/:id/files/:fileId', requirePermission('reporting-regulator', 'read'), wrap(async (req, res) => {
  const file = await evidence.download(req.params.id, req.params.fileId);
  res.set('Cache-Control', 'no-store').attachment(file.name).type(file.mimeType).send(file.content);
}));
router.delete('/reports/:id/files/:fileId', requirePermission('reporting-regulator', 'delete'), wrap(async (req, res) => { await evidence.remove(req.params.id, req.params.fileId); res.status(204).end(); }));
router.post('/reports', requirePermission('reporting-regulator', 'create'), upload.array('files',10), wrap(async (req, res) => res.status(201).json(await evidence.save(null, req.body, req.files))));
router.put('/reports/:id', requirePermission('reporting-regulator', 'update'), upload.array('files',10), wrap(async (req, res) => res.json(await evidence.save(req.params.id, req.body, req.files))));
router.get('/reports/smtp-accounts', requirePermission('reporting-regulator', 'read'), wrap(async (req, res) => {
  const accounts = await require('../services/smtpService').listAccounts();
  res.json(accounts.map(({ id, name, configured }) => ({ id, name, configured })));
}));
router.get('/reports/reminder-context', requirePermission('reporting-regulator', 'read'), wrap(async (req, res) => res.json(await reminderLink.publicContext())));
for (const [kind, permission] of [['reports', 'reporting-regulator'], ['contacts', 'narahubung']]) {
  router.get(`/${kind}`, requirePermission(permission, 'read'), wrap(async (req, res) => {
    const records = await service.list(kind);
    res.set('Cache-Control', 'no-store').json(kind === 'reports' ? await reminderLink.enrich(records) : records);
  }));
  router.post(`/${kind}`, requirePermission(permission, 'create'), wrap(async (req, res) => res.status(201).json(await service.save(kind, null, req.body))));
  router.put(`/${kind}/:id`, requirePermission(permission, 'update'), wrap(async (req, res) => res.json(await service.save(kind, req.params.id, req.body))));
  router.delete(`/${kind}/:id`, requirePermission(permission, 'delete'), wrap(async (req, res) => {
    await service.remove(kind, req.params.id);
    res.status(204).end();
  }));
}
router.use((error, req, res, next) => error instanceof multer.MulterError ? res.status(400).json({ error: 'Upload tidak valid. Maksimum 10 file, masing-masing 10 MB.' }) : next(error));
module.exports = router;
