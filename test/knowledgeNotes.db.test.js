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
    await raw(`CREATE UNIQUE INDEX knowledge_notes_title_unique ON "${schema}".knowledge_notes (LOWER(title))`);
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
    const {readNoteImport}=await import('../frontend/client/src/workspace/features/shared/noteImport.mjs');
    const payload=await readNoteImport([
      {name:'file.md',webkitRelativePath:'folder1/folder2/file.md',size:7,text:async()=> '# Notes'},
      {name:'other.md',webkitRelativePath:'folder1/folder3/deeper/other.md',size:7,text:async()=> '# Other'}
    ]);
    response=await request('/import','POST',payload);
    assert.equal(response.status,201);
    const imported=await response.json();
    assert.equal(imported.find(n=>n.title==='file').folder,'folder1/folder2');
    assert.equal(imported.find(n=>n.title==='other').folder,'folder1/folder3/deeper');
    const savedFolders=await (await request('/folders')).json();
    for(const path of ['folder1','folder1/folder2','folder1/folder3','folder1/folder3/deeper']) assert.ok(savedFolders.includes(path));
    assert.equal((await (await request('')).json()).find(n=>n.title==='file').content,'# Notes','nested imports persist when reloaded');
    await service.create({title:'Sibling',folder:'folder10',content:'Keep this'});
    assert.equal((await request('/folders','DELETE',{path:'folder1',mode:'empty'})).status,409);
    assert.equal((await request('/folders','DELETE',{path:'folder1',mode:'invalid'})).status,400);
    assert.equal((await request('/folders','DELETE',{path:'',mode:'all'})).status,400);
    assert.equal((await request('/folders','DELETE',{path:'folder1',mode:'all'})).status,200);
    const remaining=await service.list();
    assert.ok(!remaining.some(note=>['file','other'].includes(note.title)));
    assert.ok(remaining.some(note=>note.title==='Sibling'),'similar folder prefixes are preserved');
    assert.ok(remaining.some(note=>note.title==='Legacy'),'vault root notes are preserved');
    assert.ok(!(await service.folders()).some(path=>path==='folder1'||path.startsWith('folder1/')));
    assert.equal((await request('/folders','DELETE',{path:'folder1',mode:'all'})).status,404);
    response=await request('/import','POST',{notes:[],folders:['ImportedEmpty','ImportedEmpty/Subfolder']});
    assert.equal(response.status,201);
    const emptyImported=await service.folders();
    assert.ok(emptyImported.includes('ImportedEmpty/Subfolder'),'empty subfolders persist without a note');
    response=await request('/import','POST',{notes:[{title:'Same',folder:'First',content:'First copy'},{title:'Same',folder:'Second',content:'Second copy'}]});
    assert.equal(response.status,201,'matching titles in different folders import together');
    await service.ensureStore();
    assert.equal((await service.list()).filter(note=>note.title==='Same').length,2,'migration remains idempotent with folder-scoped duplicates');
    response=await request('/import','POST',{notes:[{title:'NewRollback',folder:'First',content:''},{title:'same',folder:'First',content:''}]});
    assert.equal(response.status,409,'same title in the same folder remains protected');
    assert.ok(!(await service.list()).some(note=>note.title==='NewRollback'),'conflicting imports roll back the entire batch');
    const second=(await service.list()).find(note=>note.title==='Same'&&note.folder==='Second');
    assert.equal((await request('/'+second.id,'PUT',{...second,folder:'First'})).status,409,'moving notes cannot overwrite a matching title');
    response=await request('/import','POST',{notes:[
      {title:'Index',folder:'',content:'[[folder/subfolder/Kebijakan.md|Buka kebijakan]]'},
      {title:'Kebijakan',folder:'folder/subfolder',content:'Kebijakan tujuan'},
      {title:'Kebijakan',folder:'folder-lain',content:'Catatan lain dengan judul sama'}
    ]});
    assert.equal(response.status,201);
    const loaded=await (await request('')).json();
    const index=loaded.find(note=>note.title==='Index');
    const target=loaded.find(note=>note.title==='Kebijakan'&&note.folder==='folder/subfolder');
    const {wikiLinkRanges,noteIdFromHash}=await import('../frontend/client/src/workspace/features/shared/noteNavigation.mjs');
    const link=wikiLinkRanges(index.content,loaded,index.folder)[0];
    assert.equal(link.id,String(target.id),'root Index resolves the explicit nested folder even with duplicate titles');
    assert.equal(noteIdFromHash(new URL(link.href,'http://localhost').hash),String(target.id),'generated URL opens the saved nested note');
  } finally {
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    pool.query=savedQuery;pool.connect=savedConnect;
    await raw(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await pool.end();
  }
});
