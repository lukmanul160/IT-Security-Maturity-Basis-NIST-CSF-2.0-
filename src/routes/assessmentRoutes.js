const express = require('express');
const controller = require('../controllers/assessmentController');

const router = express.Router();
router.get('/', controller.get);
router.put('/', controller.update);
router.post('/reset', controller.reset);

module.exports = router;