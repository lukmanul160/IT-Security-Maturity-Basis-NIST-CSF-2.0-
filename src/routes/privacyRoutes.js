const express = require('express');
const controller = require('../controllers/privacyController');
const assessmentController = require('../controllers/assessmentController');
const { requireAdmin } = require('../middleware/authorization');
const { requirePermission } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('privacy'), controller.list);
router.post('/', requireAdmin, controller.create);
router.get('/assessment', requirePermission('privacy-assessment'), (req, res, next) => { req.assessmentId = 'privacy'; next(); }, assessmentController.get);
router.put('/assessment', requirePermission('privacy-assessment'), (req, res, next) => { req.assessmentId = 'privacy'; next(); }, assessmentController.update);
router.post('/assessment/reset', requireAdmin, (req, res, next) => { req.assessmentId = 'privacy'; next(); }, assessmentController.reset);
router.put('/:id', requireAdmin, controller.update);
router.delete('/:id', requireAdmin, controller.remove);

module.exports = router;