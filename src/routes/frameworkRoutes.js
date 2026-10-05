const express = require('express');
const controller = require('../controllers/frameworkController');
const { requirePermission, requirePageAccess, requireFrameworkEvidenceAccess } = require('../middleware/permission');

const frameworkPermission = action => (req,res,next) => requirePageAccess(['iso27001','iso27001-soa'].includes(req.params.frameworkId) ? req.params.frameworkId : 'framework',action)(req,res,next);
const targetPermission = action => (req,res,next) => requirePageAccess(({csf:'assessment',privacy:'privacy-assessment'})[req.params.frameworkId] || (['iso27001','iso27001-soa'].includes(req.params.frameworkId) ? req.params.frameworkId : 'framework'),action)(req,res,next);
const router = express.Router();
router.get('/', requirePermission('framework', 'read'), controller.list);
router.post('/', requirePageAccess('framework', 'create'), controller.create);
router.get('/:frameworkId/controls', frameworkPermission('read'), controller.listControls);
router.get('/:frameworkId/targets', targetPermission('read'), controller.listCategoryTargets);
router.put('/:frameworkId/targets/:category', targetPermission('update'), controller.updateCategoryTarget);
router.get('/iso27001/objectives', requirePermission('iso27001', 'read'), controller.listInformationSecurityObjectives);
router.post('/iso27001/assessment/reset', requirePageAccess('iso27001', 'delete'), controller.resetIso27001Assessment);
router.post('/iso27001/objectives', requirePageAccess('iso27001', 'create'), controller.createInformationSecurityObjective);
router.put('/iso27001/objectives/:id', requirePageAccess('iso27001', 'update'), controller.updateInformationSecurityObjective);
router.delete('/iso27001/objectives/:id', requirePageAccess('iso27001', 'delete'), controller.deleteInformationSecurityObjective);
router.put('/:frameworkId/controls/:code/evidence', requireFrameworkEvidenceAccess(), controller.updateControlEvidence);
router.post('/:frameworkId/controls', frameworkPermission('create'), controller.createControl);
router.put('/:frameworkId/controls/:code', frameworkPermission('update'), controller.updateControl);
router.delete('/:frameworkId/controls/:code', frameworkPermission('delete'), controller.deleteControl);

module.exports = router;