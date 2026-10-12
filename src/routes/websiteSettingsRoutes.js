const router=require('express').Router();const service=require('../services/websiteSettingsService');const {requireAdmin}=require('../middleware/authorization');
router.get('/',requireAdmin,async(req,res,next)=>{try{res.set('Cache-Control','no-store').json(service.publicSettings(await service.read()));}catch(error){next(error);}});
router.put('/',requireAdmin,async(req,res,next)=>{try{res.json(await service.save(req.body));}catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error);}});
module.exports=router;
