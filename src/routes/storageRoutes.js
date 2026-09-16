const express = require('express');
const { requireAdmin } = require('../middleware/authorization');
const storage = require('../services/storageService');
const router = express.Router();
router.use(requireAdmin);
router.get('/', async (req, res) => res.json(await storage.getSettings()));
router.put('/', async (req, res) => res.json(await storage.saveSettings(req.body)));
router.post('/test', async (req, res) => res.json(await storage.testSettings(req.body)));
module.exports = router;
