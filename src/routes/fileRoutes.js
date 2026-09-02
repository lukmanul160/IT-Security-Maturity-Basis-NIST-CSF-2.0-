const express = require('express');
const controller = require('../controllers/fileController');
const { requireAdmin, requireCsfFileAccess } = require('../middleware/authorization');
const { requirePermission } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('files'), controller.list);
router.post('/', requirePermission('files'), controller.upload.single('file'), requireCsfFileAccess, controller.create);
router.post('/batch', requirePermission('files'), controller.upload.array('files', 50), requireCsfFileAccess, controller.createBatch);
router.get('/*path', requirePermission('files'), requireCsfFileAccess, controller.download);
router.delete('/*path', requirePermission('files'), requireCsfFileAccess, controller.remove);

module.exports = router;