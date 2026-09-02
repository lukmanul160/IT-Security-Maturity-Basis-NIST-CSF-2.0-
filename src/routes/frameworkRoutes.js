const express = require('express');
const controller = require('../controllers/frameworkController');
const { requireAdmin } = require('../middleware/authorization');
const { requirePermission, requirePageAccess } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('framework', 'read'), controller.list);
router.post('/', requirePageAccess('framework', 'create'), controller.create);
router.get('/:frameworkId/controls', requirePermission('framework', 'read'), controller.listControls);
router.post('/:frameworkId/controls', requirePageAccess('framework', 'create'), controller.createControl);
router.put('/:frameworkId/controls/:code', requirePageAccess('framework', 'update'), controller.updateControl);
router.delete('/:frameworkId/controls/:code', requirePageAccess('framework', 'delete'), controller.deleteControl);

module.exports = router;