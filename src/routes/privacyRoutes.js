const express = require('express');
const controller = require('../controllers/privacyController');
const assessmentController = require('../controllers/assessmentController');
const { requireAdmin } = require('../middleware/authorization');
const { requirePermission, requirePageAccess } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('privacy', 'read'), controller.list);
router.post('/', requirePageAccess('privacy', 'create'), controller.create);
router.get('/assessment', requirePermission('privacy-assessment', 'read'), (req, res, next) => { req.assessmentId = 'privacy'; next(); }, assessmentController.get);
router.put('/assessment', requirePageAccess('privacy-assessment', 'update'), (req, res, next) => { req.assessmentId = 'privacy'; next(); }, assessmentController.update);
router.post('/assessment/reset', requireAdmin, (req, res, next) => { req.assessmentId = 'privacy'; next(); }, assessmentController.reset);
router.put('/:id', requirePageAccess('privacy', 'update'), controller.update);
router.delete('/:id', requirePageAccess('privacy', 'delete'), controller.remove);

module.exports = router;