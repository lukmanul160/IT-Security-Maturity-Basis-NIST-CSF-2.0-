const express = require('express');
const controller = require('../controllers/certificationRoadmapCatalogController');
const { requirePermission } = require('../middleware/permission');
const router = express.Router();
router.get('/', requirePermission('personnel-certification'), controller.list);
module.exports = router;
