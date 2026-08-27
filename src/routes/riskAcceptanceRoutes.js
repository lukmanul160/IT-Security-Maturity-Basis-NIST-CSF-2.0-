const express = require('express');
const controller = require('../controllers/riskAcceptanceController');

const router = express.Router();
router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id/export/pdf', controller.exportPdf);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
