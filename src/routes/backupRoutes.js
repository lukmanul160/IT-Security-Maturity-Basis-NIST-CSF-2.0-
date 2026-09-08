const express = require('express');
const controller = require('../controllers/backupController');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();
router.use(requireAdmin);
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/restore', controller.restoreUpload.single('backup'), controller.restore);
router.delete('/:fileName', controller.remove);
router.get('/:fileName', controller.download);

module.exports = router;