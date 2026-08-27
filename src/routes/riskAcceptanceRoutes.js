const express = require('express');
const controller = require('../controllers/riskAcceptanceController');
const { requireAdmin } = require('../middleware/authorization');
const { requirePermission } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('risk-acceptance'), controller.list);
router.post('/', requireAdmin, controller.create);
router.get('/:id/export/pdf', requirePermission('risk-acceptance'), controller.exportPdf);
router.put('/:id', requireAdmin, controller.update);
router.delete('/:id', requireAdmin, controller.remove);

module.exports = router;
