const express = require('express');
const controller = require('../controllers/fileController');
const { requireAdmin, requireCsfFileAccess } = require('../middleware/authorization');
const { requirePermission, requirePageAccess } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('files', 'read'), controller.list);
router.post('/', requirePageAccess('files', 'create'), controller.upload.single('file'), requireCsfFileAccess, controller.create);
router.post('/batch', requirePageAccess('files', 'create'), controller.upload.array('files', 50), requireCsfFileAccess, controller.createBatch);
router.get('/*path', requirePermission('files', 'read'), requireCsfFileAccess, controller.download);
router.delete('/*path', requirePageAccess('files', 'delete'), requireCsfFileAccess, controller.remove);

module.exports = router;