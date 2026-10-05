const test = require('node:test');
const assert = require('node:assert/strict');
const file = (name, relativePath, content='', size=Buffer.byteLength(content)) => ({name,webkitRelativePath:relativePath,size,text:async()=>content});
test('folder import preserves root and nested Markdown paths and ignores configuration and assets',async()=>{
 const {readNoteImport}=await import('../frontend/client/src/workspace/features/shared/noteImport.mjs');
 const payload=await readNoteImport([
  file('Policy.md','Knowledge/Policy.md','\uFEFF# Policy'),
  file('Plan.MD','Knowledge/Security/Plan.MD','## Plan'),
  file('app.json','Knowledge/.obsidian/app.json','{}'),
  file('data.json','Knowledge/data.json','{}'),
  file('large.png','Knowledge/large.png','',9000000)
 ]);
 assert.deepEqual(payload,{notes:[{title:'Policy',content:'# Policy',folder:'Knowledge'},{title:'Plan',content:'## Plan',folder:'Knowledge/Security'}],folders:['Knowledge','Knowledge/Security']});
});
test('folder imports count supported notes and place them under selected destination',async()=>{
 const {readNoteImport}=await import('../frontend/client/src/workspace/features/shared/noteImport.mjs');
 const payload=await readNoteImport([file('Note.md','Folder/Note.md','hello'),...Array.from({length:250},(_,i)=>file(i+'.png','Folder/'+i+'.png','',1000000))],'Archive');
 assert.equal(payload.notes[0].folder,'Archive/Folder');
 await assert.rejects(readNoteImport([file('config.json','Folder/config.json','{}')]),/tidak berisi/);
 await assert.rejects(readNoteImport([file('Big.md','Folder/Big.md','',1000001)]),/Big.md/);
});
test('individual Markdown and JSON backup imports retain existing behavior',async()=>{
 const {readNoteImport}=await import('../frontend/client/src/workspace/features/shared/noteImport.mjs');
 assert.equal((await readNoteImport([file('Note.md','','text')],'Selected')).notes[0].folder,'Selected');
 const backup={notes:[{title:'Backup',content:'text',folder:'Original'}],folders:['Empty']};
 assert.deepEqual(await readNoteImport([file('backup.json','',JSON.stringify(backup))],'Selected'),backup);
});

test('directory traversal imports root notes and every nested sibling folder',async()=>{
 const {collectDirectoryFiles,readNoteImport}=await import('../frontend/client/src/workspace/features/shared/noteImport.mjs');
 const entry=(name,text)=>({kind:'file',name,getFile:async()=>file(name,'',text)});
 const dir=(name,entries)=>({kind:'directory',name,async *values(){yield* entries;}});
 const root=dir('folder 1',[
  dir('subfolder 1',[entry('filesubfolder2.md','Second')]),
  dir('subfolder 3',[entry('filesubfolder3.md','Third'),dir('deeper',[entry('four.md','Fourth')])]),
  entry('file1.md','First')
 ]);
 const files=await collectDirectoryFiles(root);
 const payload=await readNoteImport(files);
 assert.equal(payload.notes.length,4);
 assert.deepEqual(payload.notes.map(note=>[note.title,note.folder]),[
  ['filesubfolder2','folder 1/subfolder 1'],['filesubfolder3','folder 1/subfolder 3'],
  ['four','folder 1/subfolder 3/deeper'],['file1','folder 1']
 ]);
 const skipped=[];
 await readNoteImport([...files,file('image.png','folder 1/image.png')],'',{onSkipped:path=>skipped.push(path)});
 assert.deepEqual(skipped,['folder 1/image.png']);
});

test('unavailable files and directories do not discard readable siblings',async()=>{
 const {collectDirectoryFiles,readNoteImport}=await import('../frontend/client/src/workspace/features/shared/noteImport.mjs');
 const failures=[];
 const onUnreadable=(path,error)=>failures.push(path);
 const root={name:'Root',async *values(){
  yield {kind:'file',name:'missing.md',getFile:async()=>{throw new Error('Not found');}};
  yield {kind:'file',name:'image.pdf',getFile:async()=>{throw new Error('Must not read unsupported files');}};
  yield {kind:'directory',name:'broken',async *values(){throw new Error('Directory not found');}};
  yield {kind:'directory',name:'good',async *values(){yield {kind:'file',name:'Note.md',getFile:async()=>file('Note.md','','Readable')};}};
 }};
 const files=await collectDirectoryFiles(root,'',{onUnreadable});
 const payload=await readNoteImport(files);
 assert.deepEqual(payload.notes,[{title:'Note',content:'Readable',folder:'Root/good'}]);
 assert.deepEqual(failures,['Root/missing.md','Root/broken']);
 const unreadable={...file('bad.md','Root/bad.md'),text:async()=>{throw new Error('File disappeared');}};
 await assert.rejects(readNoteImport([unreadable,...files],'',{onUnreadable}),/Impor dibatalkan/);
 assert.equal(failures.at(-1),'Root/bad.md');
 await assert.rejects(readNoteImport([unreadable],'',{onUnreadable}),/Impor dibatalkan/);
});

test('all Markdown notes and empty directories are preserved including hidden directories',async()=>{
 const {collectDirectoryFiles,readNoteImport}=await import('../frontend/client/src/workspace/features/shared/noteImport.mjs');
 const dir=(name,entries)=>({kind:'directory',name,async *values(){yield* entries;}});
 const entry=(name)=>({kind:'file',name,getFile:async()=>file(name,'','Content')});
 const folders=[];
 const files=await collectDirectoryFiles(dir('Root',[dir('Empty',[]),dir('Nested',[dir('AlsoEmpty',[]),entry('One.md')]),dir('.hidden',[entry('Two.txt')])]),'',{onFolder:path=>folders.push(path)});
 const payload=await readNoteImport(files,'Archive',{folderPaths:folders});
 assert.equal(payload.notes.length,2);
 for(const folder of ['Archive/Root','Archive/Root/Empty','Archive/Root/Nested/AlsoEmpty','Archive/Root/.hidden'])assert.ok(payload.folders.includes(folder));
 assert.deepEqual(await readNoteImport([],'',{folderPaths:['Empty','Empty/Child']}),{notes:[],folders:['Empty','Empty/Child']});
});
