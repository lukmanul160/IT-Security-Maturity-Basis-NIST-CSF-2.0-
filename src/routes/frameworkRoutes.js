const express = require('express');
const controller = require('../controllers/frameworkController');
const { requireAdmin } = require('../middleware/authorization');
const { requirePermission } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('framework'), controller.list);
router.post('/', requireAdmin, controller.create);
router.get('/:frameworkId/controls', requirePermission('framework'), controller.listControls);
router.post('/:frameworkId/controls', requireAdmin, controller.createControl);
router.put('/:frameworkId/controls/:code', requireAdmin, controller.updateControl);
router.delete('/:frameworkId/controls/:code', requireAdmin, controller.deleteControl);

module.exports = router;