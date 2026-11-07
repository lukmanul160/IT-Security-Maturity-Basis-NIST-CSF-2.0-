/**
 * Routing dan akses API: monitoringDashboardRoutes.
 * Router menghubungkan URL, middleware dan controller/service. Pertahankan urutan middleware autentikasi, permission dan upload.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const router = require('express').Router();
const { requirePermission } = require('../middleware/permission');
router.get('/', requirePermission('monitoring-dashboard', 'read'), async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store').json(await require('../services/monitoringDashboardService').snapshot(req.user));
  } catch (error) { next(error); }
});
module.exports = router;
