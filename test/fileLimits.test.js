const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const settings = require('../src/services/websiteSettingsService');
const upload = require('../src/middleware/configuredUpload');
const { fileLimits } = require('../src/middleware/fileLimits');

test('live limits enforce multipart upload/import, JSON import and export before download', async t => {
  let limits = { uploadMb:1, importMb:2, exportMb:1 };
  t.mock.method(settings, 'read', async () => ({ fileLimits:limits }));
  const app = express();
  app.use(express.json({ limit:'5mb' }), fileLimits);
  const parser = upload({ storage:upload.memoryStorage(), limits:{ fileSize:3*1048576 } }).single('file');
  for(const route of ['/upload','/import','/restore','/maturity-workbook/csf'])app.post(route, parser, (req,res)=>res.json({bytes:req.file.size}));
  app.post('/json/import',(req,res)=>res.json({ok:true}));
  app.get('/export',(req,res)=>res.attachment('test.bin').send(Buffer.alloc(1048577)));
  app.get('/attachment',(req,res)=>res.send(Buffer.alloc(1048577)));
  app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  const post=(route,size)=>{const body=new FormData();body.append('file',new Blob([Buffer.alloc(size)]),'test.bin');return fetch(base+route,{method:'POST',body});};
  try {
    assert.equal((await post('/upload',1048576)).status,200);
    const rejected=await post('/upload',1048577);assert.equal(rejected.status,413);assert.match((await rejected.json()).error,/1 MB/);
    for(const route of ['/import','/restore','/maturity-workbook/csf'])assert.equal((await post(route,1048577)).status,200);
    assert.equal((await post('/import',2097153)).status,413);
    const rejectedExport=await fetch(base+'/export');assert.equal(rejectedExport.status,413);assert.equal(rejectedExport.headers.get('content-disposition'),null);
    assert.equal((await fetch(base+'/attachment')).status,200);
    limits={uploadMb:2,importMb:1,exportMb:2};
    assert.equal((await post('/upload',1048577)).status,200);
    assert.equal((await post('/import',1048577)).status,413);
    assert.equal((await fetch(base+'/export')).status,200);
    assert.equal((await fetch(base+'/json/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:'a'.repeat(1048576)})})).status,413);
  } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
});
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
test('file downloads and streamed note ZIP exports honor the configured export limit',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'nist-export-test-'));
 const file=path.join(directory,'backup.bin');await fs.writeFile(file,Buffer.alloc(1048577));
 t.mock.method(settings,'read',async()=>({fileLimits:{uploadMb:1,importMb:1,exportMb:1}}));
 t.mock.method(require('../src/services/permissionService'),'has',async()=>true);
 const notes=require('../src/services/knowledgeNoteService'),images=require('../src/services/knowledgeImageService');
 t.mock.method(notes,'ensureStore',async()=>{});
 let content='small note';
 t.mock.method(notes,'list',async()=>[{title:'test',content}]);t.mock.method(notes,'folders',async()=>[]);t.mock.method(images,'list',async()=>[]);
 const app=express();app.use(fileLimits);
 app.get('/backup',(req,res)=>res.download(file));app.use('/notes',require('../src/routes/knowledgeNoteRoutes'));
 app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(base+'/backup')).status,413);
  await fs.writeFile(file,'small backup');assert.equal((await fetch(base+'/backup')).status,200);
  const small=await fetch(base+'/notes/export');assert.equal(small.status,200);assert.match(small.headers.get('content-disposition'),/knowledge-notes.zip/);await small.arrayBuffer();
  content=require('node:crypto').randomBytes(2*1048576).toString('base64');
  const large=await fetch(base+'/notes/export');assert.equal(large.status,413);assert.match((await large.json()).error,/1 MB/);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(directory,{recursive:true,force:true});}
});
