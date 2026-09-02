const express = require('express');
const controller = require('../controllers/csfController');
const { requireAdmin } = require('../middleware/authorization');
const { requirePermission, requirePageAccess } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('csf', 'read'), controller.list);
router.post('/', requirePageAccess('csf', 'create'), controller.create);
router.put('/:id', requirePageAccess('csf', 'update'), controller.update);
router.delete('/:id', requirePageAccess('csf', 'delete'), controller.remove);

module.exports = router;