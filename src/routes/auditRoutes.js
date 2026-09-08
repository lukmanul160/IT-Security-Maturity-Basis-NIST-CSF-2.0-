const express = require('express');
const auditService = require('../services/auditService');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();
router.get('/', requireAdmin, async (req, res, next) => {
  try { res.json(await auditService.list(req.query)); } catch (error) { next(error); }
});

module.exports = router;