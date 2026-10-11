const router=require('express').Router();
const service=require('../services/reminderRecipientService');
const {requireAdmin}=require('../middleware/authorization');
router.get('/',async(req,res,next)=>{try{const permissions=require('../services/permissionService');let allowed=req.user.role==='admin';for(const key of ['policy-register','audit-finding-tracker','asset-register'])if(await permissions.has(req.user.role,key,'read'))allowed=true;if(!allowed)return res.status(403).json({error:'Akses register penerima tidak diizinkan.'});res.json(await service.list());}catch(error){next(error);}});
router.post('/',requireAdmin,async(req,res,next)=>{try{res.json(await service.save(req.body));}catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error);}});
module.exports=router;
