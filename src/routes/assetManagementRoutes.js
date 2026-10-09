const router=require('express').Router();
const service=require('../services/assetManagementService');
const {requirePermission}=require('../middleware/permission');
const permissions=require('../services/permissionService');
const photos=require('../services/assetRackPhotoService');
const reminderSettings=require('../services/assetReminderSettingsService');
const diagram=require('../services/assetDiagramService');
const multer=require('multer');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:2,fields:3,fieldSize:20000}});
const assetUpload=upload.fields([{name:'front',maxCount:1},{name:'rear',maxCount:1}]);
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res)).catch(next);
const keys={assets:'asset-register',racks:'server-racks',placements:'server-racks',relations:'asset-modelling'};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const transfer=require('../services/assetTransferService');
const transferUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:100*1024*1024,files:1,fields:0}}).single('file');
const transferPermissions=actions=>actions.flatMap(action=>['asset-register','server-racks','asset-modelling'].map(key=>requirePermission(key,action)));
router.get('/export',...transferPermissions(['read']),wrap(async(req,res)=>{const data=JSON.stringify(await transfer.exportData());if(Buffer.byteLength(data)>100*1024*1024)throw Object.assign(new Error('Export melebihi 100 MB. Gunakan Database Backup dan File Backup.'),{status:400});res.set({'Content-Disposition':'attachment; filename="asset-management.json"','Cache-Control':'private, no-store'}).type('application/json').send(data);}));
router.post('/import',...transferPermissions(['read','create','update']),transferUpload,wrap(async(req,res)=>{
 if(!req.file||!req.file.originalname.toLowerCase().endsWith('.json'))throw Object.assign(new Error('Pilih file JSON Asset Management.'),{status:400});
 let payload;try{payload=JSON.parse(req.file.buffer.toString('utf8').replace(/^\uFEFF/,''));}catch{throw Object.assign(new Error('File JSON tidak valid.'),{status:400});}
 transfer.validate(payload);
 if(payload.data.assets.some(a=>a.managedVendorId)&&!await permissions.has(req.user?.role,'tprm-register','read'))throw Object.assign(new Error('Akses baca TPRM diperlukan untuk import vendor pengelola.'),{status:403});
 if(payload.data.assets.some(a=>a.riskRegisterIds?.length)&&!await permissions.has(req.user?.role,'risk-management','read'))throw Object.assign(new Error('Akses baca Risk Management diperlukan untuk import Related risk.'),{status:403});
 res.json(await transfer.importData(payload,req.user,req.file.buffer));
}));
router.get('/reminder-settings',requirePermission('asset-register','read'),wrap(async(req,res)=>res.json(await reminderSettings.getSettings())));
router.put('/reminder-settings',requirePermission('asset-register','update'),wrap(async(req,res)=>res.json(await reminderSettings.saveSettings(req.body))));
router.get('/vendor-catalog',requirePermission('asset-register','read'),requirePermission('tprm-register','read'),wrap(async(req,res)=>res.json(await service.managedVendorCatalog())));
router.get('/risk-catalog',requirePermission('asset-register','read'),requirePermission('risk-management','read'),wrap(async(req,res)=>res.json(await require('../services/riskManagementService').listRegister())));
router.get('/diagram',requirePermission('asset-modelling','read'),wrap(async(req,res)=>res.json(await diagram.read())));
router.put('/diagram',requirePermission('asset-modelling','update'),wrap(async(req,res)=>res.json(await diagram.save(req.body))));
router.param('id',(req,res,next,id)=>uuid(id)?next():res.status(400).json({error:'ID tidak valid.'}));
router.use((req,res,next)=>{for(const key of ['assetId','rackId','sourceId','targetId'])if(req.body?.[key]!==undefined&&!uuid(req.body[key]))return res.status(400).json({error:'Referensi aset/rak tidak valid.'});next();});
for(const [kind,key] of Object.entries(keys)){
router.get('/'+kind,requirePermission(key,'read'),wrap(async(req,res)=>res.json(await service.list(kind))));
router.delete('/'+kind+'/:id',requirePermission(key,'delete'),wrap(async(req,res)=>{await service.remove(kind,req.params.id);res.status(204).end();}));
}
async function saveRegisteredAsset(req,id){
 let data=req.body,photoInput=null;
 if(req.is('multipart/form-data')){try{data=JSON.parse(req.body.data);}catch{throw Object.assign(new Error('Data aset tidak valid.'),{status:400});}photoInput={files:req.files,body:req.body,user:req.user};}
 if(data.managedVendorId&&!await permissions.has(req.user?.role,'tprm-register','read')){const existing=id?(await service.list('assets')).find(a=>a.id===id):null;if(existing?.managedVendorId!==data.managedVendorId)throw Object.assign(new Error('Akses baca TPRM diperlukan untuk memilih vendor pengelola.'),{status:403});}
 return service.saveAsset(id,data,photoInput);
}
router.put('/assets/:id/related-risks',requirePermission('asset-register','update'),requirePermission('risk-management','read'),wrap(async(req,res)=>res.json(await service.saveRiskLinks(req.params.id,req.body?.riskRegisterIds))));
router.post('/assets',requirePermission('asset-register','create'),assetUpload,wrap(async(req,res)=>res.status(201).json(await saveRegisteredAsset(req,null))));
router.put('/assets/:id',requirePermission('asset-register','update'),assetUpload,wrap(async(req,res)=>res.json(await saveRegisteredAsset(req,req.params.id))));
for(const [kind,save] of [['racks',service.saveRack]]){
router.post('/'+kind,requirePermission(keys[kind],'create'),wrap(async(req,res)=>res.status(201).json(await save(null,req.body))));
router.put('/'+kind+'/:id',requirePermission(keys[kind],'update'),wrap(async(req,res)=>res.json(await save(req.params.id,req.body))));
}
router.get('/catalog',wrap(async(req,res,next)=>{const p=require('../services/permissionService');if(!await p.has(req.user?.role,'server-racks','read')&&!await p.has(req.user?.role,'asset-modelling','read'))return res.status(403).json({error:'Akses ditolak.'});res.json((await service.list('assets')).map(({id,tag,name,type,status,rackName})=>({id,tag,name,type,status,rackName})));}));
router.put('/placements',requirePermission('server-racks','update'),wrap(async(req,res)=>res.json(await service.place(req.body))));
router.post('/relations',requirePermission('asset-modelling','create'),wrap(async(req,res)=>res.status(201).json(await service.relate(req.body))));
router.put('/relations/:id',requirePermission('asset-modelling','update'),wrap(async(req,res)=>res.json(await service.relate(req.body,req.params.id))));
router.get('/photos',wrap(async(req,res)=>{const rackRead=await permissions.has(req.user?.role,'server-racks','read');const assetRead=await permissions.has(req.user?.role,'asset-register','read');if(!rackRead&&!assetRead)return res.status(403).json({error:'Akses foto ditolak.'});res.json(await photos.list(rackRead?undefined:'assets'));}));
const photoPermission=action=>async(req,res,next)=>{const key=req.params.kind==='assets'?'asset-register':'server-racks';if(await permissions.has(req.user?.role,key,action)||(action==='read'&&req.params.kind==='assets'&&await permissions.has(req.user?.role,'server-racks','read')))return next();res.status(403).json({error:'Akses foto ditolak.'});};
router.get('/photos/:kind/:id/:side',photoPermission('read'),wrap(async(req,res)=>{const photo=await photos.read(req.params.kind,req.params.id,req.params.side);res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'}).type(photo.mime_type).send(photo.content);}));
router.put('/photos/:kind/:id',photoPermission('update'),assetUpload,wrap(async(req,res)=>res.json(await photos.save(req.params.kind,req.params.id,req.files,req.body,req.user))));
module.exports=router;
