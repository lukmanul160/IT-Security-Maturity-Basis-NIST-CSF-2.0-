const express = require('express');
const controller = require('../controllers/assessmentController');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();
router.get('/', controller.get);
router.put('/', controller.update);
router.post('/reset', requireAdmin, controller.reset);

module.exports = router;