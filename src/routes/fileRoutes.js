const express = require('express');
const controller = require('../controllers/fileController');
const { requireAdmin, requireCsfFileAccess } = require('../middleware/authorization');
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
router.put('/*path', requireCsfFileAccess, controller.replacementUpload.single('file'), controller.replace);
// Evidence links can be opened by any authenticated user. Ownership is enforced for replace/delete in the controller.
router.get('/*path', controller.download);
router.delete('/*path', requireCsfFileAccess, controller.remove);

module.exports = router;
