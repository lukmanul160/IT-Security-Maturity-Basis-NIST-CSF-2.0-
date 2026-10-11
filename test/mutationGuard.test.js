const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {pool}=require('../src/config/database');
const {createMutationGuard}=require('../src/middleware/mutationGuard');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function clientGuard(){const fs=require('node:fs/promises');const source=await fs.readFile('frontend/client/src/services/mutationGuard.js','utf8');return (await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).createMutationGuard;}
test('identical pending browser mutations use one request and independently readable responses',async()=>{
 const create=await clientGuard(),gate=deferred();let calls=0;
 const guarded=create(async()=>{calls++;await gate.promise;return new Response('{"id":1}',{status:201});},'https://example.test');
 const first=guarded('/api/risks',{method:'POST',body:'{"name":"Risk","level":2}'});
 const second=guarded('/api/risks',{method:'POST',body:'{"level":2,"name":"Risk"}'});
 await Promise.resolve();assert.equal(calls,1);gate.resolve();
 const responses=await Promise.all([first,second]);assert.deepEqual(await responses[0].json(),{id:1});assert.deepEqual(await responses[1].json(),{id:1});
 await guarded('/api/risks',{method:'POST',body:'{"level":2,"name":"Risk"}'});assert.equal(calls,2);
});
test('different payloads remain independent and failed requests can be retried',async()=>{
 const create=await clientGuard();let calls=0;
 const guarded=create(async()=>{if(++calls===1)throw Error('Network failed');return new Response('{}');},'https://example.test');
 await assert.rejects(guarded('/api/risks',{method:'POST',body:'{}'}),/Network failed/);
 await guarded('/api/risks',{method:'POST',body:'{}'});assert.equal(calls,2);
 await Promise.all([guarded('/api/risks',{method:'POST',body:'{"a":1}'}),guarded('/api/risks',{method:'POST',body:'{"a":2}'})]);assert.equal(calls,4);
});
test('multipart repeats share one upload and GET requests remain independent',async()=>{
 const create=await clientGuard(),gate=deferred();let calls=0;
 const guarded=create(async()=>{calls++;await gate.promise;return new Response('{}');},'https://example.test');
 const form=new FormData();form.append('data','{"title":"one"}');form.append('file',new Blob(['evidence']),'evidence.pdf');
 const one=guarded('/api/upload',{method:'POST',body:form}),two=guarded('/api/upload',{method:'POST',body:form});await Promise.resolve();assert.equal(calls,1);gate.resolve();await Promise.all([one,two]);
 await Promise.all([guarded('/api/risks'),guarded('/api/risks')]);assert.equal(calls,3);
});
test('update and delete on the same record are locked across users',async()=>{
 const locks=new Set();const gate=deferred(),entered=deferred();let writes=0;
 const db={connect:async()=>({query:async(sql,args)=>{const key=args.join(':');if(sql.includes('pg_try_advisory_lock')){const acquired=!locks.has(key);if(acquired)locks.add(key);return {rows:[{acquired}]};}locks.delete(key);return {rows:[]};},release(){}})};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={username:req.get('x-test-user')};next();});
 const a=createMutationGuard({db}),b=createMutationGuard({db});app.use((req,res,next)=>(req.method==='PUT'?a:b)(req,res,next));
 app.put('/api/records/1',async(req,res)=>{writes++;entered.resolve();await gate.promise;res.json({saved:true});});
 app.delete('/api/records/1',(req,res)=>{writes++;res.status(204).end();});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/api/records/1';
 try{
  const first=fetch(url,{method:'PUT',headers:{'x-test-user':'one','Content-Type':'application/json'},body:'{"value":1}'});await entered.promise;
  const second=await fetch(url+'?extra=1',{method:'DELETE',headers:{'x-test-user':'two'}});assert.equal(second.status,409);assert.equal(writes,1);
  gate.resolve();assert.equal((await first).status,200);
 }finally{gate.resolve();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('database lock prevents duplicate pending creates across server instances, retaining lock after disconnect',async()=>{
 const gate=deferred(),entered=deferred();let inserts=0;const clients=[];
 const db={connect:async()=>{const actual=await pool.connect();clients.push(actual);return {query:actual.query.bind(actual),release:destroy=>actual.release(destroy)};}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={username:'mutation-test'};next();});
 const a=createMutationGuard({db}),b=createMutationGuard({db});let index=0;app.use((req,res,next)=>(index++%2?a:b)(req,res,next));
 app.post('/api/test',async(req,res)=>{inserts++;entered.resolve();await gate.promise;res.status(201).json({id:inserts});});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url='http://127.0.0.1:'+server.address().port+'/api/test';
 const send=signal=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"title":"same"}',signal});
 try {
  const abort=new AbortController();const first=send(abort.signal).catch(e=>e);await entered.promise;abort.abort();await first;
  const duplicate=await send();assert.equal(duplicate.status,409);assert.equal((await duplicate.json()).code,'MUTATION_PENDING');assert.equal(inserts,1);
  gate.resolve();await new Promise(r=>setTimeout(r,30));const retry=await send();assert.equal(retry.status,201);assert.equal(inserts,2);
 }finally{gate.resolve();await new Promise(r=>setTimeout(r,30));server.closeAllConnections();await new Promise(r=>server.close(r));}
});
