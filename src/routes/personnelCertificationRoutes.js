const express = require('express');
const controller = require('../controllers/personnelCertificationController');
const { requirePermission, requirePageAccess } = require('../middleware/permission');
const { requireAdmin } = require('../middleware/authorization');
const router = express.Router();
router.get('/', requirePermission('personnel-certification', 'read'), controller.list);
router.get('/organization-personnel', requirePermission('personnel-certification', 'read'), controller.organizationList);
router.post('/organization-personnel', requireAdmin, controller.organizationCreate);
router.put('/organization-personnel/:personnelId', requireAdmin, controller.organizationUpdate);
router.delete('/organization-personnel/:personnelId', requireAdmin, controller.organizationDelete);
// Users may add certificates to registered employees, without gaining catalog or employee creation rights.
router.post('/', (req, res, next) => requirePageAccess('personnel-certification', req.user?.role === 'user' ? 'read' : 'create')(req, res, next), controller.create);
router.put('/:id/layout', requirePageAccess('personnel-certification', 'update'), controller.updateLayout);
router.put('/:id', requirePageAccess('personnel-certification', 'update'), controller.update);
router.delete('/:id', requirePageAccess('personnel-certification', 'delete'), controller.remove);
module.exports = router;
