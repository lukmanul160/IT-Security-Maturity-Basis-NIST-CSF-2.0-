/**
 * Routing dan akses API: websiteSettingsRoutes.
 * Router menghubungkan URL, middleware dan controller/service. Pertahankan urutan middleware autentikasi, permission dan upload.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const router=require('express').Router();const service=require('../services/websiteSettingsService');const {requireAdmin}=require('../middleware/authorization');
router.get('/',requireAdmin,async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(service.publicSettings(await service.read()));}catch(error){next(error);}});
router.put('/',requireAdmin,async(req,res,next)=>{try{res.json(await service.save(req.body));}catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error);}});
module.exports=router;
