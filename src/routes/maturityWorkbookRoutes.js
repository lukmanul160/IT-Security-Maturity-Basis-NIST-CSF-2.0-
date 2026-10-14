const router=require('express').Router();
const multer=require('multer');
const periods=require('../services/assessmentPeriodService');
const jobs=require('../services/workbookJobService');
const permissions=require('../services/permissionService');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}});
router.use('/maturity-workbook/:framework',async(req,res,next)=>{
  const framework=req.params.framework;
  if(!['csf','privacy'].includes(framework))return res.status(404).json({error:'Framework Excel tidak tersedia.'});
  const key=framework==='csf'?'assessment':'privacy-assessment';
  if(!await permissions.has(req.user?.role,key,'read'))return res.status(403).json({error:'Akses assessment tidak diizinkan.'});
  if(req.method==='POST') {
    if(!await permissions.has(req.user?.role,key,'update')||!await permissions.has(req.user?.role,framework,'read'))return res.status(403).json({error:'Izin Edit assessment dan akses kontrol diperlukan untuk import.'});
  }
  next();
});
router.get('/maturity-workbook/:framework',async(req,res)=>{
  await periods.ensureStore();
  const year=periods.validateYear(req.query.assessmentYear??2026),framework=req.params.framework;
  const {data}=await periods.workbookSnapshot(framework,year);
  const buffer=await jobs.run('maturity','write',[{[framework]:data},year]);
  res.set('Cache-Control','no-store').attachment(`NIST-${framework==='csf'?'CSF-2.0':'Privacy'}-Maturity-${year}.xlsx`).send(buffer);
});
router.post('/maturity-workbook/:framework/preview',upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'File Excel wajib diisi.'});
  await periods.ensureStore();const year=periods.validateYear(req.query.assessmentYear??2026),framework=req.params.framework;
  const payload=await jobs.run('maturity','read',[req.file.buffer,framework]),{data}=await periods.workbookSnapshot(framework,year),previous=new Set(data.controls[framework].map(row=>row.id));
  const added=payload.controls.filter(row=>!previous.has(row.id)).length;
  res.json({year,controls:payload.controls.length,added,updated:payload.controls.length-added,categories:new Set(payload.controls.map(row=>row.category)).size,functions:new Set(payload.controls.map(row=>row.function)).size});
});
router.post('/maturity-workbook/:framework',upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'File Excel wajib diisi.'});
  const framework=req.params.framework,year=periods.validateYear(req.query.assessmentYear??2026),payload=await jobs.run('maturity','read',[req.file.buffer,framework]);
  res.json({imported:true,year,...await periods.importMaturityWorkbook(framework,year,payload,req.user)});
});
module.exports=router;
