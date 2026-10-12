const router=require('express').Router();
const service=require('../services/assessmentPeriodService');
const permissions=require('../services/permissionService');
router.use('/:framework',async(req,res,next)=>{
  const framework=req.params.framework;
  if(!Object.hasOwn(service.permissions,framework))return res.status(404).json({error:'Framework assessment tidak tersedia.'});
  const action=req.method==='GET'?'read':req.method==='DELETE'?'delete':'create';
  if(action==='read'){
    const keys=framework==='csf'?['assessment','csf']:['privacy','ikas'].includes(framework)?[framework+'-assessment',framework]:service.permissions[framework];
    const allowed=await Promise.all(keys.map(key=>permissions.has(req.user?.role,key,'read')));
    if(!allowed.some(Boolean))return res.status(403).json({error:'Akses assessment tidak diizinkan.'});
    return next();
  }
  for(const key of service.permissions[framework])if(!await permissions.has(req.user?.role,key,action))return res.status(403).json({error:`Access denied for ${key} (${action})`});
  if(req.method!=='GET')for(const key of service.permissions[framework])if(!await permissions.has(req.user?.role,key,'read'))return res.status(403).json({error:'Akses tahun sumber tidak diizinkan.'});
  next();
});
router.get('/:framework',async(req,res)=>res.set('Cache-Control','no-store').json(await service.list(req.params.framework)));
router.post('/:framework',async(req,res)=>res.status(201).json(await service.create(req.params.framework,req.body,req.user)));
router.delete('/:framework/:year',async(req,res)=>{await service.remove(req.params.framework,req.params.year);res.status(204).end();});
module.exports=router;
