const router = require('express').Router();
const service = require('../services/fileBackupService');
const { requireAdmin } = require('../middleware/authorization');
const multer = require('multer');
const path = require('node:path');
const os = require('node:os');
const upload = multer({ dest: path.join(os.tmpdir(), 'nist-file-backup-restore'), limits: { fileSize: 500 * 1024 * 1024 }, fileFilter(req, file, done) { done(null, path.extname(file.originalname).toLowerCase() === '.zip'); } });

router.use(requireAdmin);
router.get('/', async (req, res) => res.json(await service.list()));
router.post('/', async (req, res) => res.status(201).json(await service.create()));
router.post('/restore', upload.single('backup'), async (req, res) => res.json(await service.restore(req.file)));
router.get('/:fileName', async (req, res) => res.download(await service.resolve(req.params.fileName), req.params.fileName));
router.delete('/:fileName', async (req, res) => { await service.remove(req.params.fileName); res.status(204).end(); });
module.exports = router;
