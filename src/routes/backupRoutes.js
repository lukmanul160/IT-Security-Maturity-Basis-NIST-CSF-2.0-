/**
 * Routing dan akses API: backupRoutes.
 * Router menghubungkan URL, middleware dan controller/service. Pertahankan urutan middleware autentikasi, permission dan upload.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const express = require('express');
const controller = require('../controllers/backupController');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();
router.use(requireAdmin);
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/restore-batch', controller.batchUpload.array('backups'), controller.restoreBatch);
router.post('/restore', controller.restoreUpload.single('backup'), controller.restore);
router.delete('/:fileName', controller.remove);
router.get('/:fileName', controller.download);

module.exports = router;