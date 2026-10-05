const express = require('express');
const controller = require('../controllers/personnelCertificationController');
const { requirePermission, requirePageAccess } = require('../middleware/permission');
const router = express.Router();
router.get('/', requirePermission('personnel-certification', 'read'), controller.list);
router.get('/organization-personnel', requirePermission('personnel-certification', 'read'), controller.organizationList);
router.post('/organization-personnel', requirePermission('personnel-certification', 'create'), controller.organizationCreate);
router.put('/organization-personnel/:personnelId', requirePermission('personnel-certification', 'update'), controller.organizationUpdate);
router.delete('/organization-personnel/:personnelId', requirePermission('personnel-certification', 'delete'), controller.organizationDelete);
// Employee records and certificates share the configured personnel feature actions.
router.post('/', requirePageAccess('personnel-certification', 'create'), controller.create);
router.put('/:id/layout', requirePageAccess('personnel-certification', 'update'), controller.updateLayout);
router.put('/:id', requirePageAccess('personnel-certification', 'update'), controller.update);
router.delete('/:id', requirePageAccess('personnel-certification', 'delete'), controller.remove);
module.exports = router;
