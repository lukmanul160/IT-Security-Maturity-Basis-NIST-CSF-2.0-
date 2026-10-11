const express = require('express');
const auditService = require('../services/auditService');
const { requireAdmin } = require('../middleware/authorization');

const router = express.Router();
const retention=require('../services/auditRetentionService');
router.get('/retention',requireAdmin,async(req,res,next)=>{try{res.json(await retention.read());}catch(error){next(error);}});
router.put('/retention',requireAdmin,async(req,res,next)=>{try{res.json(await retention.save(req.body));}catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error);}});

router.get('/export',requireAdmin,async(req,res,next)=>{
 try{const format=req.query.format||'csv',iterator=auditService.exportChunks(req.query,format),first=await iterator.next();
 res.set('Content-Type',format==='csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8');res.set('Cache-Control','no-store');res.attachment('application-activity-'+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok'}).format(new Date())+'.'+format);
 const write=chunk=>new Promise(resolve=>{if(res.destroyed)return resolve(false);if(res.write(chunk))return resolve(true);const done=()=>{res.off('drain',drain);res.off('close',close);};const drain=()=>{done();resolve(true);};const close=()=>{done();resolve(false);};res.once('drain',drain);res.once('close',close);});
 if(!first.done&&await write(first.value))for await(const chunk of iterator){if(!await write(chunk))break;}if(!res.destroyed)res.end();
 }catch(error){if(res.headersSent)res.destroy(error);else if(error.status)res.status(error.status).json({error:error.message});else next(error);}
});
router.get('/', requireAdmin, async (req, res, next) => {
  try { res.json(await auditService.list(req.query)); } catch (error) { next(error); }
});

// Browser-generated transfers are declarations; database mutations are logged separately.
router.post('/activity', async (req, res) => {
  const { action, module, filename, count, outcome, message, error } = req.body || {};
  if (!['export', 'import', 'report', 'download'].includes(action) || typeof module !== 'string' || module.length > 100 || (filename != null && (typeof filename !== 'string' || filename.length > 255))) return res.status(400).json({ error: 'Aktivitas tidak valid' });
  if (!['initiated', 'success', 'failed'].includes(outcome) || [message, error].some(value => value != null && (typeof value !== 'string' || value.length > 2000))) return res.status(400).json({ error: 'Hasil aktivitas tidak valid' });
  req.auditDetails = { action: `data.${action}`, module, filename, count: Number.isSafeInteger(count) && count >= 0 ? count : undefined, outcome, message, error, source: 'browser-declared' };
  try {
    await auditService.record({ requestId: req.requestId, actorUsername: req.user.username, actorRole: req.user.role,
      eventType: `data.${action}`, method: req.method, path: '/api/audit/activity', statusCode: 204,
      ipAddress: req.ip, userAgent: req.get('user-agent'), details: require('../middleware/audit').sanitize(req.auditDetails) });
    req.auditRecorded = true;
    res.status(204).end();
  } catch (error) {
    console.error('[audit] Transfer persistence failed:', error.message);
    res.status(503).json({ error: 'Audit trail tidak dapat disimpan ke database. Periksa koneksi database atau tabel audit_events.', requestId: req.requestId });
  }
});
module.exports = router;
