const express = require('express');
const controller = require('../controllers/tprmController');
const { requirePermission } = require('../middleware/permission');
const router = express.Router();
router.get('/', requirePermission('tprm-register'), controller.list);
router.post('/', requirePermission('tprm-register'), controller.create);
router.put('/:id', requirePermission('tprm-register'), controller.update);
router.delete('/:id', requirePermission('tprm-register'), controller.remove);
module.exports = router;
