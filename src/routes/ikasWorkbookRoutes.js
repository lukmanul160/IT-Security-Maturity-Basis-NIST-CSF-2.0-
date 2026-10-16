const router=require('express').Router();
const multer=require('../middleware/configuredUpload');
const periods=require('../services/assessmentPeriodService');
const jobs=require('../services/workbookJobService');
const permissions=require('../services/permissionService');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1}});
router.get('/ikas-template',async(req,res)=>{
  if(!await permissions.has(req.user?.role,'ikas','read')&&!await permissions.has(req.user?.role,'ikas-assessment','read'))return res.status(403).json({error:'Akses IKAS tidak diizinkan.'});
  const {version,domains,respondentFields}=require('../services/ikasService').seed;res.json({version,domains,respondentFields});
});
router.use('/ikas-workbook',async(req,res,next)=>{
  for(const action of req.method==='GET'?['read']:['read','update'])if(!await permissions.has(req.user?.role,'ikas-assessment',action))return res.status(403).json({error:'Akses assessment IKAS tidak diizinkan.'});
  if(req.method==='POST'&&!await permissions.has(req.user?.role,'ikas','update'))return res.status(403).json({error:'Izin Edit kontrol IKAS diperlukan untuk import applicability.'});
  next();
});
router.get('/ikas-workbook',async(req,res)=>{
  await periods.ensureStore();const year=periods.validateYear(req.query.assessmentYear??2026),period=await periods.period('ikas',year);
  const buffer=await jobs.run('ikas','write',[period.data,year]);
  res.set('Cache-Control','no-store').attachment(`IKAS-BSSN-v1.2.1-${year}.xlsx`).send(buffer);
});
router.post('/ikas-workbook',upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'File Excel wajib diisi.'});
  const year=periods.validateYear(req.query.assessmentYear??2026);
  let domains;
  if(req.body.domains){try{domains=JSON.parse(req.body.domains);}catch{return res.status(400).json({error:'Pilihan domain import tidak valid.'});}}
  const payload=await jobs.run('ikas','read',[req.file.buffer,domains]);
  const result=await periods.importIkas(year,payload,req.user);res.json({imported:true,year,...result});
});
router.post('/ikas-workbook/preview',upload.single('file'),async(req,res)=>{
  if(!req.file)return res.status(400).json({error:'File Excel wajib diisi.'});
  await periods.ensureStore();const year=periods.validateYear(req.query.assessmentYear??2026),period=await periods.period('ikas',year),payload=await jobs.run('ikas','read',[req.file.buffer]);
  const previous=new Set(period.data.controls.ikas.map(row=>row.id)),incoming=new Set(payload.controls.map(row=>row.id));
  res.json({year,domains:payload.domains.map(name=>({name,questions:payload.controls.filter(row=>row.function===name).length,added:payload.controls.filter(row=>row.function===name&&!previous.has(row.id)).length,removed:period.data.controls.ikas.filter(row=>row.function===name&&!incoming.has(row.id)).length})),completeWorkbook:!!payload.template});
});
module.exports=router;
