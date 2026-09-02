const express = require('express');
const controller = require('../controllers/riskAcceptanceController');
const { requirePermission, requirePageAccess } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('risk-acceptance', 'read'), controller.list);
router.post('/', requirePageAccess('risk-acceptance', 'create'), controller.create);
router.get('/:id/export/pdf', requirePermission('risk-acceptance', 'read'), controller.exportPdf);
router.put('/:id', requirePageAccess('risk-acceptance', 'update'), controller.update);
router.delete('/:id', requirePageAccess('risk-acceptance', 'delete'), controller.remove);

module.exports = router;
