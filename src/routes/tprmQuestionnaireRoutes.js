const express = require('express');
const controller = require('../controllers/tprmQuestionnaireController');
const { requirePermission } = require('../middleware/permission');
const router = express.Router();
router.get('/', requirePermission('tprm-questionnaire'), controller.list);
router.post('/', requirePermission('tprm-questionnaire'), controller.create);
router.put('/:id', requirePermission('tprm-questionnaire'), controller.update);
router.delete('/:id', requirePermission('tprm-questionnaire'), controller.remove);
module.exports = router;
