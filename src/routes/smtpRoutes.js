const router = require('express').Router();
const smtp = require('../services/smtpService');
const { requireAdmin } = require('../middleware/authorization');
router.use(requireAdmin);
const handle = action => async (req,res) => {
  try {res.json(await action(req));}
  catch(error) {res.status(error.status || 500).json({error:error.status ? error.message : 'Pengaturan SMTP belum dapat diproses.'});}
};
router.get('/accounts',handle(()=>smtp.listAccounts()));
router.post('/accounts',handle(req=>smtp.createAccount(req.body)));
router.put('/accounts/:id',handle(req=>smtp.saveSettings(req.body,req.params.id)));
router.get('/',handle(()=>smtp.getSettings()));
router.put('/',handle(req=>smtp.saveSettings(req.body)));
router.post('/test',handle(req=>smtp.testEmail(req.body?.to,req.body?.smtpAccountId)));
module.exports = router;
