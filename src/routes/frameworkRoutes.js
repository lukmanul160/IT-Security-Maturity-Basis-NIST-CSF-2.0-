const express = require('express');
const controller = require('../controllers/frameworkController');
const { requireAdmin } = require('../middleware/authorization');
const { requirePermission, requirePageAccess, requireFrameworkEvidenceAccess } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('framework', 'read'), controller.list);
router.post('/', requirePageAccess('framework', 'create'), controller.create);
router.get('/:frameworkId/controls', requirePermission('framework', 'read'), controller.listControls);
router.get('/:frameworkId/targets', requirePermission('framework', 'read'), controller.listCategoryTargets);
router.put('/:frameworkId/targets/:category', requirePageAccess('framework', 'update'), controller.updateCategoryTarget);
router.get('/iso27001/objectives', requirePermission('iso27001', 'read'), controller.listInformationSecurityObjectives);
router.post('/iso27001/assessment/reset', requirePageAccess('iso27001', 'delete'), controller.resetIso27001Assessment);
router.post('/iso27001/objectives', requirePageAccess('iso27001', 'create'), controller.createInformationSecurityObjective);
router.put('/iso27001/objectives/:id', requirePageAccess('iso27001', 'update'), controller.updateInformationSecurityObjective);
router.delete('/iso27001/objectives/:id', requirePageAccess('iso27001', 'delete'), controller.deleteInformationSecurityObjective);
router.put('/:frameworkId/controls/:code/evidence', requireFrameworkEvidenceAccess(), controller.updateControlEvidence);
router.post('/:frameworkId/controls', requirePageAccess('framework', 'create'), controller.createControl);
router.put('/:frameworkId/controls/:code', requirePageAccess('framework', 'update'), controller.updateControl);
router.delete('/:frameworkId/controls/:code', requirePageAccess('framework', 'delete'), controller.deleteControl);

module.exports = router;