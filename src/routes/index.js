const express = require('express');
const assessmentRoutes = require('./assessmentRoutes');
const fileRoutes = require('./fileRoutes');
const csfRoutes = require('./csfRoutes');
const privacyRoutes = require('./privacyRoutes');
const frameworkRoutes = require('./frameworkRoutes');
const healthController = require('../controllers/healthController');

const router = express.Router();
router.get('/health', (req, res) => res.json({ ok: true }));
router.get('/health/db', healthController.database);
router.use('/assessment', assessmentRoutes);
router.use('/files', fileRoutes);
router.use('/csf', csfRoutes);
router.use('/privacy', privacyRoutes);
router.use('/frameworks', frameworkRoutes);

module.exports = router;