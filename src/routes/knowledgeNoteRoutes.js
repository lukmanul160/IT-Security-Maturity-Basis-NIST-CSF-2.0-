const router = require('express').Router();
const service = require('../services/knowledgeNoteService');
const { requirePermission } = require('../middleware/permission');
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
router.post('/folders',requirePermission('knowledge-notes','create'),async(req,res)=>res.status(201).json(await service.createFolder(req.body?.path)));
router.put('/folders',requirePermission('knowledge-notes','update'),async(req,res)=>res.json(await service.moveFolder(req.body?.source,req.body?.destination)));
router.delete('/folders',requirePermission('knowledge-notes','delete'),async(req,res)=>res.json(await service.removeFolder(req.body?.path)));
router.get('/export', requirePermission('knowledge-notes','read'), async(req,res)=>{
  const notes = await service.list();
  const folders = await service.folders();
  const archive = require('archiver')('zip');
  archive.on('error', error=>res.destroy(error));
  res.attachment('knowledge-notes.zip'); archive.pipe(res);
  for (const folder of folders) archive.append('',{name:folder+'/'});
  for (const note of notes) archive.append(note.content,{name:`${note.folder ? note.folder+'/' : ''}${note.title}.md`});
  // Original titles preserve wiki-link resolution when importing the JSON backup.
  archive.append(JSON.stringify({format:'knowledge-notes-v1',notes,folders},null,2),{name:'knowledge-notes.json'});
  await archive.finalize();
});
router.post('/import',requirePermission('knowledge-notes','create'),async(req,res)=>res.status(201).json(await service.importNotes(req.body?.notes,req.body?.folders)));
router.post('/',requirePermission('knowledge-notes','create'),async(req,res)=>res.status(201).json(await service.create(req.body)));
router.put('/:id',requirePermission('knowledge-notes','update'),async(req,res)=>res.json(await service.update(req.params.id,req.body)));
router.delete('/:id',requirePermission('knowledge-notes','delete'),async(req,res)=>{await service.remove(req.params.id);res.sendStatus(204);});
module.exports = router;
