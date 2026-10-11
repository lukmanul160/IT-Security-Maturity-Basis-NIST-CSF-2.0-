const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const source=fs.readFileSync('frontend/client/src/services/uploadProgress.js','utf8');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fixture(t){
 const previous=global.XMLHttpRequest,requests=[];
 class XHR {
  constructor(){this.upload={};this.headers={};requests.push(this);}
  open(method,url){this.method=method;this.url=url;}
  setRequestHeader(key,value){this.headers[key]=value;}
  send(body){this.body=body;}
  abort(){this.onabort?.();}
  getAllResponseHeaders(){return 'Content-Type: application/json\r\nX-Request-Id: fixture';}
  respond(status,data){this.status=status;this.statusText=status===200?'OK':'Bad Request';this.responseURL=this.url;this.response=new TextEncoder().encode(JSON.stringify(data)).buffer;this.onload();}
 }
 global.XMLHttpRequest=XHR;t.after(()=>{if(previous===undefined)delete global.XMLHttpRequest;else global.XMLHttpRequest=previous;});
 const body=new FormData();body.append('files',new Blob(['file bytes']),'evidence.pdf');body.append('files',new Blob(['second']),'second.zip');
 const progress=[];const task={update:info=>progress.push(info)};
 return {requests,body,progress,task};
}
test('multipart progress measures bytes, distinguishes server processing and completes only after response',async t=>{
 const api=await modulePromise,f=fixture(t),observed=[];
 const promise=api.uploadRequest('/api/files/batch',{method:'POST',body:f.body,uploadTask:f.task,onUploadProgress:info=>observed.push(info)});
 const xhr=f.requests[0];assert.equal(f.progress[0].percent,0);assert.equal(xhr.body,f.body);
 xhr.upload.onprogress({lengthComputable:true,loaded:25,total:100});assert.equal(f.progress.at(-1).percent,25);
 xhr.upload.onload();assert.equal(f.progress.at(-1).phase,'processing');assert.equal(f.progress.at(-1).percent,null);
 xhr.upload.onprogress({lengthComputable:true,loaded:100,total:100});assert.equal(f.progress.at(-1).phase,'processing');
 xhr.respond(200,{uploaded:2});const response=await promise;assert.equal(response.ok,true);assert.deepEqual(await response.json(),{uploaded:2});assert.equal(response.headers.get('X-Request-Id'),'fixture');assert.equal(f.progress.at(-1).phase,'success');assert.equal(f.progress.at(-1).percent,100);assert.equal(observed.length,f.progress.length);
});
test('HTTP errors preserve fetch response and show server error without claiming completion',async t=>{
 const api=await modulePromise,f=fixture(t);const promise=api.uploadRequest('/api/files',{method:'POST',body:f.body,uploadTask:f.task});
 f.requests[0].respond(400,{error:'Batch tidak lengkap'});const response=await promise;assert.equal(response.status,400);assert.equal(response.ok,false);assert.equal((await response.json()).error,'Batch tidak lengkap');assert.equal(f.progress.at(-1).phase,'error');assert.equal(f.progress.at(-1).percent,null);assert.equal(f.progress.at(-1).detail,'Batch tidak lengkap');
});
test('abort signal cancels upload and late responses cannot turn failure into success',async t=>{
 const api=await modulePromise,f=fixture(t),controller=new AbortController();
 const promise=api.uploadRequest('/api/files',{method:'POST',body:f.body,uploadTask:f.task,signal:controller.signal});
 controller.abort();await assert.rejects(promise,error=>error.name==='AbortError');f.requests[0].respond(200,{});assert.equal(f.progress.at(-1).phase,'error');
});
test('network failure is actionable and observer failures do not break the request',async t=>{
 const api=await modulePromise,f=fixture(t);const promise=api.uploadRequest('/api/files',{method:'POST',body:f.body,uploadTask:f.task});
 f.requests[0].onerror();await assert.rejects(promise,/Koneksi terputus/);assert.equal(f.progress.at(-1).phase,'error');
});
test('parallel uploads keep independent byte progress and completion',async t=>{
 const api=await modulePromise,f=fixture(t),other=[];
 const first=api.uploadRequest('/api/files',{method:'POST',body:f.body,uploadTask:f.task});
 const second=api.uploadRequest('/api/files',{method:'POST',body:f.body,uploadTask:{update:info=>other.push(info)}});
 f.requests[0].upload.onprogress({lengthComputable:true,loaded:60,total:100});f.requests[1].upload.onprogress({lengthComputable:true,loaded:20,total:100});
 assert.equal(f.progress.at(-1).percent,60);assert.equal(other.at(-1).percent,20);
 f.requests[0].respond(200,{});await first;assert.equal(other.at(-1).phase,'uploading');f.requests[1].respond(200,{});await second;
});
test('shared interceptor handles API multipart while preserving JSON, foreign and Request fetch calls',async t=>{
 const api=await modulePromise,f=fixture(t),previous=global.window,originalCalls=[];
 global.window={location:{href:'http://localhost/app',origin:'http://localhost'},fetch:(...args)=>{originalCalls.push(args);return Promise.resolve(new Response('{}'));}};
 t.after(()=>{if(previous===undefined)delete global.window;else global.window=previous;});
 api.installUploadProgress();const installed=window.fetch;api.installUploadProgress();assert.equal(window.fetch,installed);
 await window.fetch('/api/assessment',{method:'PUT',body:'{}'});await window.fetch('https://example.org/upload',{method:'POST',body:f.body});await window.fetch('/api/files',{method:'POST',body:f.body,credentials:'omit'});await window.fetch(new Request('http://localhost/api/files'),{method:'POST',body:f.body});
 assert.equal(originalCalls.length,4);assert.equal(f.requests.length,0);
 const result=window.fetch('/api/files',{method:'POST',body:f.body,uploadTask:f.task,headers:{'X-Test':'preserved'}});assert.equal(f.requests[0].headers['x-test'],'preserved');f.requests[0].respond(200,{});await result;
});
