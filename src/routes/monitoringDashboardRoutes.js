const router = require('express').Router();
const { requirePermission } = require('../middleware/permission');
router.get('/', requirePermission('monitoring-dashboard', 'read'), async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store').json(await require('../services/monitoringDashboardService').snapshot(req.user));
  } catch (error) { next(error); }
});
module.exports = router;
