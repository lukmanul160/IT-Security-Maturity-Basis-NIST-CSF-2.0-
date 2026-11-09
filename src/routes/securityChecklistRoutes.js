/** Authenticated checklist API; page actions and record assignment are both enforced. */
const router = require('express').Router();
const service = require('../services/securityChecklistService');
const { requirePermission } = require('../middleware/permission');
const multer = require('../middleware/configuredUpload');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 10, fileSize: 10 * 1024 * 1024, fields: 1, fieldSize: 10 * 1024 * 1024 },
});
const key = 'compliance-security-checklist';
router.use((req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  next();
});
router.use(requirePermission(key));
const authorizeUpload = (assessment) => async (req, res, next) => {
  await service.authorizeUpload(req.params.id, req.user, assessment);
  next();
};
router.param('id', (req, res, next, id) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? next()
    : res.status(400).json({ error: 'ID checklist tidak valid.' }),
);
router.get('/', async (req, res) =>
  res.json({ checklists: await service.list(req.user), columns: service.defaults }),
);
router.param('fileId', (req, res, next, id) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? next()
    : res.status(400).json({ error: 'ID file tidak valid.' }),
);
router.get('/:id/files/:fileId', async (req, res) => {
  const file = await service.download(req.params.id, req.params.fileId, req.user);
  res
    .set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'",
    })
    .attachment(file.name)
    .type(file.mime)
    .send(file.content);
});
router.get('/users', async (req, res) => res.json(await service.users()));
router.post('/assignments', requirePermission(key, 'create'), async (req, res) =>
  res.status(201).json(await service.createAssignment(req.body, req.user)),
);
router.patch('/:id/assignment-info', requirePermission(key, 'update'), async (req, res) =>
  res.json(await service.updateAssignment(req.params.id, req.body, req.user)),
);
router.post('/', requirePermission(key, 'create'), upload.array('files', 10), async (req, res) =>
  res.status(201).json(await service.createTemplate(req.body, req.user, req.files || [])),
);
router.put(
  '/:id',
  requirePermission(key, 'update'),
  authorizeUpload(false),
  upload.array('files', 10),
  async (req, res) => res.json(await service.save(req.params.id, req.body, req.user, false, req.files || [])),
);
router.patch(
  '/:id/assessment',
  requirePermission(key, 'update'),
  authorizeUpload(true),
  upload.array('files', 10),
  async (req, res) => res.json(await service.save(req.params.id, req.body, req.user, true, req.files || [])),
);
router.delete('/:id', requirePermission(key, 'delete'), async (req, res) => {
  await service.remove(req.params.id, req.body?.version, req.user);
  res.status(204).end();
});
router.use((error, req, res, next) =>
  error instanceof multer.MulterError
    ? res.status(400).json({ error: 'Upload tidak valid. Maksimum 10 file, masing-masing 10 MB.' })
    : next(error),
);
module.exports = router;
