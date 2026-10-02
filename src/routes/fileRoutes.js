const express = require('express');
const controller = require('../controllers/fileController');
const { requireCsfFileAccess } = require('../middleware/authorization');
const { requirePermission, requirePageAccess } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('files', 'read'), controller.list);
router.post('/', requirePageAccess('files', 'create'), controller.upload.single('file'), requireCsfFileAccess, controller.create);
router.post('/batch', requirePageAccess('files', 'create'), controller.upload.array('files', 50), requireCsfFileAccess, controller.createBatch);
// Replace/delete are authorized by ownership in the controller, so a regular user can manage their own uploads.
router.get('/access/*path', controller.access);
router.get('/open/*path', controller.open);
router.get('/open-page/*path', controller.getOpenPage);
router.put('/open-page/*path', controller.setOpenPage);
router.put('/*path', controller.replacementUpload.single('file'), controller.replace);
// All file operations, including open/download, enforce uploader ownership in the controller.
router.get('/*path', controller.download);
router.delete('/*path', controller.remove);

module.exports = router;
