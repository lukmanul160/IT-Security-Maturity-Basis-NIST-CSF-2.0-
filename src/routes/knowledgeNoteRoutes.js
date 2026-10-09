const router = require('express').Router();
const service = require('../services/knowledgeNoteService');
const { requirePermission } = require('../middleware/permission');
const images=require('../services/knowledgeImageService');
const fs=require('node:fs/promises');
const upload=require('multer')({
 storage:require('../services/boundedUploadStorage').createBoundedUploadStorage(require('node:path').join(require('node:os').tmpdir(),'nist-note-images'),100*1024*1024),
 limits:{fileSize:10*1024*1024,files:300,fields:4,fieldSize:10*1024*1024},
 fileFilter:(req,file,done)=>done(/\.(png|jpe?g|gif|webp|md|txt|json)$/i.test(file.originalname)?null:Object.assign(new Error('Format gambar tidak didukung.'),{status:400}),true)
});
const imageFiles=req=>Array.isArray(req.files)?req.files:req.files?.images||[];
const allFiles=req=>Array.isArray(req.files)?req.files:Object.values(req.files||{}).flat();
const uploadedImages=async(req)=>{
 const files=imageFiles(req);
 const paths=JSON.parse(req.body.paths || '[]');
 if(!Array.isArray(paths)||paths.length!==files.length)throw Object.assign(new Error('Daftar gambar tidak valid.'),{status:400});
 const uploadedBy=await require('../services/evidenceAccessService').userId(req.user);
 return Promise.all(files.map(async(file,index)=>({path:paths[index],content:await fs.readFile(file.path),uploadedBy})));
};
const cleanup=async(req)=>Promise.all(allFiles(req).map(file=>fs.rm(file.path,{force:true})));
// Apply additive migrations on first use as well as normal server startup.
// A failed connection is retried on the next request instead of disabling folders.
let initialized;
router.use(async(req,res,next)=>{
  if(!initialized) initialized=service.ensureStore().catch(error=>{initialized=null;throw error;});
  await initialized;
  next();
});
router.get('/', requirePermission('knowledge-notes','read'), async(req,res)=>res.json(await service.list()));
router.get('/folders',requirePermission('knowledge-notes','read'),async(req,res)=>res.json(await service.folders()));
router.get('/images',requirePermission('knowledge-notes','read'),async(req,res)=>res.json(await images.list()));
router.get('/images/:id',requirePermission('knowledge-notes','read'),async(req,res)=>{
 const image=await images.read(req.params.id);
 res.set({'Cache-Control':'private, no-store','Content-Security-Policy':"sandbox; default-src 'none'"}).type(image.type).send(image.content);
});
router.post('/images',requirePermission('knowledge-notes','create'),upload.array('images',1),async(req,res)=>{
 try{const values=await uploadedImages(req);if(values.length!==1)throw Object.assign(new Error('Pilih satu gambar.'),{status:400});await service.importNotes([],[],values);res.status(201).json((await images.list()).find(image=>image.path===values[0].path));}
 finally{await cleanup(req);}
});
router.put('/images/:id',requirePermission('knowledge-notes','update'),async(req,res)=>res.json(await images.move(req.params.id,req.body?.folder)));
router.delete('/images/:id',requirePermission('knowledge-notes','delete'),async(req,res)=>{await images.remove(req.params.id);res.sendStatus(204);});
router.post('/import-with-images',requirePermission('knowledge-notes','create'),upload.fields([{name:'images',maxCount:100},{name:'documents',maxCount:200}]),async(req,res)=>{
 try{const payload=JSON.parse(req.body.payload||'{}');
 const files=req.files?.documents||[],paths=JSON.parse(req.body.documentPaths||'[]');
 if(!Array.isArray(paths)||paths.length!==files.length)throw Object.assign(new Error('Daftar file catatan tidak valid.'),{status:400});
 const uploadedBy=await require('../services/evidenceAccessService').userId(req.user);
 const documents=await Promise.all(files.map(async(file,index)=>({path:paths[index],content:await fs.readFile(file.path),uploadedBy})));
 res.status(201).json(await service.importNotes(payload.notes,payload.folders,await uploadedImages(req),documents));}

 finally{await cleanup(req);}
});
router.post('/folders',requirePermission('knowledge-notes','create'),async(req,res)=>res.status(201).json(await service.createFolder(req.body?.path)));
router.put('/folders',requirePermission('knowledge-notes','update'),async(req,res)=>res.json(await service.moveFolder(req.body?.source,req.body?.destination)));
router.delete('/folders',requirePermission('knowledge-notes','delete'),async(req,res)=>res.json(await service.removeFolder(req.body?.path,req.body?.mode)));
router.get('/export', requirePermission('knowledge-notes','read'), async(req,res)=>{
  const notes = await service.list();
  const folders = await service.folders();
  const archive = require('archiver')('zip');
  archive.on('error', error=>res.destroy(error));
  res.attachment('knowledge-notes.zip'); archive.pipe(res);
  for (const folder of folders) archive.append('',{name:folder+'/'});
  for (const note of notes) archive.append(note.content,{name:`${note.folder ? note.folder+'/' : ''}${note.title}.md`});
  for(const image of await images.list())archive.append((await images.read(image.id)).content,{name:image.path});
  // Original titles preserve wiki-link resolution when importing the JSON backup.
  archive.append(JSON.stringify({format:'knowledge-notes-v1',notes,folders},null,2),{name:'knowledge-notes.json'});
  await archive.finalize();
});
router.post('/import',requirePermission('knowledge-notes','create'),async(req,res)=>res.status(201).json(await service.importNotes(req.body?.notes,req.body?.folders)));
router.post('/',requirePermission('knowledge-notes','create'),async(req,res)=>res.status(201).json(await service.create(req.body)));
router.put('/:id',requirePermission('knowledge-notes','update'),async(req,res)=>res.json(await service.update(req.params.id,req.body)));
router.delete('/:id',requirePermission('knowledge-notes','delete'),async(req,res)=>{await service.remove(req.params.id);res.sendStatus(204);});
module.exports = router;
