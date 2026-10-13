const express = require('express');
const router = express.Router();
const { list, create, update, remove } = require('../services/questionnaireTemplateService');
const { requirePermission, requirePageAccess } = require('../middleware/permission');
router.get('/:id/excel',requirePermission('questionnaire-templates','read'),async(req,res,next)=>{
  try{const result=await require('../services/tprmQuestionnaireExcelService').exportTemplate(req.params.id);res.set('Cache-Control','no-store').type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment(result.filename).send(result.buffer);}catch(error){next(error);}
});

router.get('/', requirePermission('questionnaire-templates', 'read'), async (req, res) => {
  try {
    const templates = await list();
    res.json(templates);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', requirePageAccess('questionnaire-templates', 'create'), async (req, res) => {
  try {
    const template = await create(req.body);
    res.json(template);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', requirePageAccess('questionnaire-templates', 'update'), async (req, res) => {
  try {
    const template = await update(req.params.id, req.body);
    res.json(template);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', requirePageAccess('questionnaire-templates', 'delete'), async (req, res) => {
  try {
    const template = await remove(req.params.id);
    res.json(template);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
