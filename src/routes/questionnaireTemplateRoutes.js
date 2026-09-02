const express = require('express');
const router = express.Router();
const { list, create, update, remove } = require('../services/questionnaireTemplateService');
const { requireAdmin } = require('../middleware/authorization');
const { requirePermission } = require('../middleware/permission');

router.get('/', requirePermission('questionnaire-templates'), async (req, res) => {
  try {
    const templates = await list();
    res.json(templates);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const template = await create(req.body);
    res.json(template);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const template = await update(req.params.id, req.body);
    res.json(template);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const template = await remove(req.params.id);
    res.json(template);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
