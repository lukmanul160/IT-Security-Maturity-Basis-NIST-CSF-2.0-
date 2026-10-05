const express = require('express');
const controller = require('../controllers/certificationRoadmapCatalogController');
const { requirePermission } = require('../middleware/permission');
const router = express.Router();
router.get('/', requirePermission('personnel-certification', 'read'), controller.list);
router.post('/', requirePermission('personnel-certification', 'create'), controller.create);
router.put('/:id', requirePermission('personnel-certification', 'update'), controller.update);
router.delete('/:id', requirePermission('personnel-certification', 'delete'), controller.remove);
module.exports = router;
