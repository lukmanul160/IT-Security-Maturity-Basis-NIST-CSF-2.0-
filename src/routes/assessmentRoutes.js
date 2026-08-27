const express = require('express');
const controller = require('../controllers/assessmentController');
const { requireAdmin } = require('../middleware/authorization');
const { requirePermission } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('assessment'), controller.get);
router.put('/', requirePermission('assessment'), controller.update);
router.post('/reset', requireAdmin, controller.reset);

module.exports = router;