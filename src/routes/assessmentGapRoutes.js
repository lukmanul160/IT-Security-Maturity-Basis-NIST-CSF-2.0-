const router=require('express').Router();
const service=require('../services/assessmentGapService');
const {requirePermission}=require('../middleware/permission');
const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
router.use('/:framework',(req,res,next)=>{
  if(!Object.hasOwn(service.permissionKeys,req.params.framework)) return res.status(404).json({error:'Framework gap tidak tersedia.'});
  const action=req.method==='GET'?'read':req.method==='DELETE'?'delete':'update';
  return requirePermission(service.permissionKeys[req.params.framework],action)(req,res,next);
});
router.get('/:framework',async(req,res)=>{res.set('Cache-Control','no-store');res.json(await service.list(req.params.framework));});
router.post('/:framework/import',async(req,res)=>res.json(await service.importGaps(req.params.framework,req.body?.gaps,req.user)));
const save=async(req,res)=>{
  if(req.params.id && !validId(req.params.id)) return res.status(400).json({error:'ID gap tidak valid.'});
  res.status(req.params.id?200:201).json(await service.save(req.params.framework,req.params.code,req.params.id,req.body,req.user));
};
router.post('/:framework/:code',save);
router.put('/:framework/:code/:id',save);
router.delete('/:framework/:code/:id',async(req,res)=>{
  if(!validId(req.params.id)) return res.status(400).json({error:'ID gap tidak valid.'});
  await service.remove(req.params.framework,req.params.code,req.params.id,req.user,req.body.updatedAt);res.json({ok:true});
});
module.exports=router;
