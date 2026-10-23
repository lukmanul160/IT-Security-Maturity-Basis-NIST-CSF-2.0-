const test=require('node:test'),assert=require('node:assert/strict'),express=require('express'),JSZip=require('jszip');
const settings=require('../src/services/websiteSettingsService'),documents=require('../src/services/statementDocumentService'),upload=require('../src/middleware/configuredUpload');
const MB=1048576;
test('Word editor accepts a valid 50 MB DOCX and rejects the next byte and lower live limits',async()=>{
 const zip=await JSZip.loadAsync(await documents.plain('LARGE DOCX FIXTURE'));
 zip.file('word/media/fixture.png',Buffer.alloc(0));
 const overhead=(await zip.generateAsync({type:'nodebuffer',compression:'STORE'})).length;
 zip.file('word/media/fixture.png',Buffer.alloc(50*MB-overhead));
 const buffer=await zip.generateAsync({type:'nodebuffer',compression:'STORE'});
 assert.equal(buffer.length,50*MB);
 assert.match((await documents.inspect(buffer)).body,/LARGE DOCX FIXTURE/);
 await assert.rejects(()=>documents.inspect(Buffer.concat([buffer,Buffer.from([0])])),{status:413});
 await assert.rejects(()=>documents.inspect(buffer,{maxFileMb:1}),{status:413});
 // Small ZIPs still cannot bypass the limit on actual inflated bytes.
 zip.file('word/media/fixture.png',Buffer.alloc(6*MB));
 const compressed=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 await assert.rejects(()=>documents.inspect(compressed,{maxFileMb:1}),{status:400});
});
test('document upload limit updates live independently of general upload limits',async t=>{
 let documentEditMb=50;
 t.mock.method(settings,'read',async()=>({fileLimits:{uploadMb:1,documentEditMb}}));
 const app=express();
 app.put('/document',upload({limitKey:'documentEditMb',storage:upload.memoryStorage(),limits:{files:1}}).single('document'),(req,res)=>res.json({size:req.file.size,limit:req.fileLimits.documentEditMb}));
 app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>new Promise(r=>{server.closeAllConnections();server.close(r);}));
 const put=async()=>{const body=new FormData();body.set('document',new Blob([Buffer.alloc(6*MB)]),'large.docx');return fetch('http://127.0.0.1:'+server.address().port+'/document',{method:'PUT',body});};
 assert.equal((await put()).status,200);
 documentEditMb=1;
 const denied=await put();assert.equal(denied.status,413);assert.match((await denied.json()).error,/edit dokumen 1 MB/);
 documentEditMb=10;assert.equal((await put()).status,200);
 assert.equal(settings.fileLimits({fileLimits:{uploadMb:1}}).documentEditMb,50);
 for(const value of [0,501,1.5,'50',null])assert.throws(()=>settings.validate({name:'Site',tagline:'',fileLimits:{uploadMb:1,importMb:1,exportMb:1,documentEditMb:value}}),{status:400});
 assert.equal(settings.validate({name:'Site',tagline:'',fileLimits:{uploadMb:1,importMb:1,exportMb:1,documentEditMb:25}}).fileLimits.documentEditMb,25);
});
