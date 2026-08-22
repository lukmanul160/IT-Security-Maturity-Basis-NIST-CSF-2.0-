const express = require('express');
const controller = require('../controllers/fileController');

const router = express.Router();
router.get('/', controller.list);
router.post('/', controller.upload.single('file'), controller.create);
router.post('/batch', controller.upload.array('files', 50), controller.createBatch);
router.get('/*path', controller.download);
router.delete('/*path', controller.remove);

module.exports = router;