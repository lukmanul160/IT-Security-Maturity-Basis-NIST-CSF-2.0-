const express = require('express');
const controller = require('../controllers/csfController');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();
router.get('/', controller.list);
router.post('/', requireAdmin, controller.create);
router.put('/:id', requireAdmin, controller.update);
router.delete('/:id', requireAdmin, controller.remove);

module.exports = router;