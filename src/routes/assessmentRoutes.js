/**
 * Routing dan akses API: assessmentRoutes.
 * Router menghubungkan URL, middleware dan controller/service. Pertahankan urutan middleware autentikasi, permission dan upload.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const express = require('express');
const controller = require('../controllers/assessmentController');
const { requirePermission, requirePageAccess } = require('../middleware/permission');

const router = express.Router();
router.get('/', requirePermission('assessment', 'read'), controller.get);
router.put('/', requirePageAccess('assessment', 'update'), controller.update);
router.post('/reset', requirePermission('assessment', 'delete'), controller.reset);

module.exports = router;