const express = require('express');
const controller = require('../controllers/tprmController');
const { requirePermission, requirePageAccess } = require('../middleware/permission');
const router = express.Router();
router.get('/', requirePermission('tprm-register', 'read'), controller.list);
router.post('/', requirePageAccess('tprm-register', 'create'), controller.create);
router.put('/:id', requirePageAccess('tprm-register', 'update'), controller.update);
router.delete('/:id', requirePageAccess('tprm-register', 'delete'), controller.remove);
module.exports = router;
