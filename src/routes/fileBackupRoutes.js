const router = require('express').Router();
const service = require('../services/fileBackupService');
const { requireAdmin } = require('../middleware/authorization');
const multer = require('../middleware/configuredUpload');
const path = require('node:path');
const os = require('node:os');
const upload = multer({ dest: path.join(os.tmpdir(), 'nist-file-backup-restore'), limits: { fileSize: 500 * 1024 * 1024 }, fileFilter(req, file, done) { done(null, path.extname(file.originalname).toLowerCase() === '.zip'); } });

function selectedFolders(req) {
  if (req.body?.folders !== undefined) {
    let folders = req.body.folders;
    if (typeof folders === 'string') {
      try { folders = JSON.parse(folders); }
      catch { throw Object.assign(new Error('Pilihan folder tidak valid.'), { status: 400 }); }
    }
    if (!Array.isArray(folders)) throw Object.assign(new Error('Pilihan folder harus berupa daftar.'), { status: 400 });
    return folders;
  }
  return req.body?.folder;
}
router.use(requireAdmin);
router.get('/', async (req, res) => res.json(await service.list()));
router.get('/folders', async (req, res) => res.json(await service.folders()));
router.post('/', async (req, res) => res.status(201).json(await service.create({ folder: selectedFolders(req) })));
router.post('/inspect', upload.array('backups'), async (req, res) => res.json(await service.inspect(req.files)));
router.post('/restore', upload.single('backup'), async (req, res) => res.json(await service.restore(req.file, { folder: selectedFolders(req) })));
router.post('/restore-batch', upload.array('backups'), async (req, res) => res.json(await service.restore(req.files, { folder: selectedFolders(req) })));
router.get('/:fileName', async (req, res) => res.download(await service.resolve(req.params.fileName), req.params.fileName));
router.delete('/:fileName', async (req, res) => { await service.remove(req.params.fileName); res.status(204).end(); });
module.exports = router;
