const express = require('express');
const controller = require('../controllers/assessmentController');
const { requirePermission, requirePageAccess } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('assessment', 'read'), controller.get);
router.put('/', requirePageAccess('assessment', 'update'), controller.update);
router.post('/reset', requirePermission('assessment', 'delete'), controller.reset);

module.exports = router;