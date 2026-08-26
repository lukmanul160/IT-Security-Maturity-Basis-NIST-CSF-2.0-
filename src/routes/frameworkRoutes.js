const express = require('express');
const controller = require('../controllers/frameworkController');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();
router.use(requireAdmin);
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:frameworkId/controls', controller.listControls);
router.post('/:frameworkId/controls', controller.createControl);
router.put('/:frameworkId/controls/:code', controller.updateControl);
router.delete('/:frameworkId/controls/:code', controller.deleteControl);

module.exports = router;