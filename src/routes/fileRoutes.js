const express = require('express');
const controller = require('../controllers/fileController');
const { requireAdmin, requireCsfFileAccess } = require('../middleware/authorization');

const router = express.Router();
router.get('/', requireAdmin, controller.list);
router.post('/', controller.upload.single('file'), requireCsfFileAccess, controller.create);
router.post('/batch', controller.upload.array('files', 50), requireCsfFileAccess, controller.createBatch);
router.get('/*path', requireCsfFileAccess, controller.download);
router.delete('/*path', requireCsfFileAccess, controller.remove);

module.exports = router;