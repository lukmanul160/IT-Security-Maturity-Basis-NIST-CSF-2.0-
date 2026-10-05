const test=require('node:test');
const assert=require('node:assert/strict');
const {pool}=require('../src/config/database');
test('legacy migration and folder API preserve notes through moves, conflicts and deletion', {skip:process.env.RUN_NOTES_DB_TESTS!=='1'},async()=>{
  const savedQuery=pool.query,savedConnect=pool.connect;
  const acquire=savedConnect.bind(pool);
  const raw=async(sql,values)=>{const client=await acquire();try{return await client.query(sql,values);}finally{client.release();}};
  const schema=`notes_api_test_${process.pid}_${Date.now()}`;
  const rewrite=sql=>sql.replace(/\b(knowledge_notes|knowledge_note_folders)\b/g,`"${schema}".$1`);
  let server;
  pool.options.connectionTimeoutMillis=30000;
  try {
    await raw(`CREATE SCHEMA "${schema}"`);
    await raw(`CREATE TABLE "${schema}".knowledge_notes (id BIGSERIAL PRIMARY KEY,title TEXT NOT NULL,content TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    await raw(`INSERT INTO "${schema}".knowledge_notes (title,content) VALUES ('Legacy','preserved')`);
    pool.query=(sql,values)=>raw(rewrite(sql),values);
    pool.connect=async()=>{const client=await acquire();return {query:(sql,values)=>client.query(rewrite(sql),values),release:()=>client.release()};};
    const service=require('../src/services/knowledgeNoteService');
    await service.ensureStore();await service.ensureStore();
    const legacy=(await service.list())[0];assert.equal(legacy.content,'preserved');assert.equal(legacy.folder,'');
    await service.createFolder('Security/Policies/Drafts');await service.createFolder('Archive');await service.createFolder('Empty');
    const note=await service.create({title:'Policy',folder:'Security/Policies',content:'[[Legacy]]'});
    const express=require('express'),app=express();app.use(express.json());app.use((req,res,next)=>{req.user={role:'admin'};next();});app.use('/notes',require('../src/routes/knowledgeNoteRoutes'));app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}/notes`;
    const request=(url,method='GET',body)=>fetch(base+url,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
    let response=await request('/folders','POST',{path:'Another/Child'});assert.equal(response.status,201);assert.ok((await response.json()).includes('Another/Child'));
    response=await request('/folders','PUT',{source:'Security',destination:'Archive/Security'});const moved=await response.json();assert.equal(response.status,200,moved.error);
    assert.ok(moved.folders.includes('Archive/Security/Policies/Drafts'));
    const current=moved.notes.find(n=>n.id===note.id);assert.equal(current.folder,'Archive/Security/Policies');assert.equal(current.version,note.version+1);
    assert.equal((await request('/'+note.id,'PUT',note)).status,409,'stale editor cannot undo a folder move');
    assert.equal((await request('/folders','PUT',{source:'Archive/Security',destination:'Archive/Security/Policies'})).status,400);
    assert.equal((await request('/folders','PUT',{source:'Archive/Security',destination:'Another'})).status,409);
    assert.ok((await service.folders()).includes('Archive/Security/Policies/Drafts'),'conflict rolls back all descendant changes');
    assert.equal((await request('/folders','DELETE',{path:'Archive'})).status,409,'nonempty folders cannot erase notes');
    assert.equal((await request('/folders','DELETE',{path:'Empty'})).status,200);
    response=await request('/'+note.id,'PUT',{...current,folder:''});assert.equal(response.status,200);assert.equal((await response.json()).folder,'');
    assert.equal((await request('/folders','DELETE',{path:'Archive/Security'})).status,200);
    assert.ok(!(await service.folders()).some(p=>p.startsWith('Archive/Security')));
    assert.equal((await service.list()).find(n=>n.id===note.id).content,'[[Legacy]]');
  } finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    pool.query=savedQuery;pool.connect=savedConnect;
    await raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();
  }
});
