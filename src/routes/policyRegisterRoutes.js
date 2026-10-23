const express = require('express');
const controller = require('../controllers/policyRegisterController');
const { requirePermission, requirePageAccess } = require('../middleware/permission');


const router = express.Router();
const reminders = require('../services/policyReminderService');
const adminOnly = (req, res, next) => req.user?.role === 'admin' ? next() : res.status(403).json({ error: 'Pengaturan reminder hanya dapat diakses admin.' });
const reminderHandler = action => async (req, res, next) => {
  try { res.json(await action(req)); } catch (error) {
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Pengaturan reminder belum dapat diproses.' });
  }
};
router.get('/reminder-settings', adminOnly, reminderHandler(() => reminders.getSettings()));
router.put('/reminder-settings', adminOnly, reminderHandler(req => reminders.saveSettings(req.body)));
router.post('/reminder-settings/test', adminOnly, reminderHandler(req => reminders.testEmail(req.body?.to)));


router.get('/dropdowns', requirePermission('policy-register', 'read'), controller.listDropdowns);
const documentService=require('../services/policyDocumentService');
const documentUpload=require('../middleware/configuredUpload')({limitKey:'documentEditMb',storage:require('../middleware/configuredUpload').memoryStorage(),limits:{files:1,fields:1,fieldSize:100}}).single('document');
router.get('/:id/document',requirePermission('policy-register','read'),requirePermission('policy-register','update'),async(req,res,next)=>{
  try{const result=await documentService.load(req.params.id,req.user,{maxFileMb:req.fileLimits?.documentEditMb ?? 50});res.set({'Cache-Control':'no-store','X-Document-Revision':result.revision}).attachment(result.name).type(documentService.mime).send(result.buffer);}catch(error){next(error);}
});
router.put('/:id/document',requirePermission('policy-register','update'),documentUpload,async(req,res,next)=>{
  try{res.set('Cache-Control','no-store').json(await documentService.save(req.params.id,req.user,req.file,req.body.revision,{maxFileMb:req.fileLimits?.documentEditMb ?? 50}));}catch(error){next(error);}
});
router.post('/dropdowns', requirePageAccess('policy-register', 'create'), controller.createDropdown);
router.put('/dropdowns/:id', requirePageAccess('policy-register', 'update'), controller.updateDropdown);
router.delete('/dropdowns/:id', requirePageAccess('policy-register', 'delete'), controller.removeDropdown);

router.get('/:id/items', requirePermission('policy-register', 'read'), controller.listItems);
router.post('/:id/items', requirePageAccess('policy-register', 'create'), controller.createItem);
router.put('/:id/items/:itemId', requirePageAccess('policy-register', 'update'), controller.updateItem);
router.delete('/:id/items/:itemId', requirePageAccess('policy-register', 'delete'), controller.removeItem);

// GET /api/policy-register - List all policies
router.get(
  '/',
  requirePermission('policy-register', 'read'),
  controller.list
);

// POST /api/policy-register - Create new policy
router.post(
  '/',
  requirePageAccess('policy-register', 'create'),
  controller.upload.single('file'),
  controller.create
);

// PUT /api/policy-register/:id - Update policy
router.put(
  '/:id',
  requirePageAccess('policy-register', 'update'),
  controller.upload.single('file'),
  controller.update
);

// DELETE /api/policy-register/:id - Delete policy
router.delete(
  '/:id',
  requirePageAccess('policy-register', 'delete'),
  controller.remove
);


module.exports = router;
