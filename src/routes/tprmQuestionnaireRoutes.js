const express = require('express');
const controller = require('../controllers/tprmQuestionnaireController');
const { requirePermission, requirePageAccess } = require('../middleware/permission');
const router = express.Router();
router.get('/', requirePermission('tprm-questionnaire', 'read'), controller.list);
router.post('/', requirePageAccess('tprm-questionnaire', 'create'), controller.create);
router.put('/:id', requirePageAccess('tprm-questionnaire', 'update'), controller.update);
router.delete('/:id', requirePageAccess('tprm-questionnaire', 'delete'), controller.remove);
module.exports = router;
