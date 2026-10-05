const test=require('node:test');
const assert=require('node:assert/strict');
const path='../frontend/client/src/workspace/features/shared/noteSearch.mjs';
const notes=[
  {id:1,title:'Access Policy',folder:'Security/Policies',content:'Audit internal untuk akses data. #security [[Risk Register]]'},
  {id:2,title:'Meeting',folder:'Archive',content:'Audit internal tahun lalu. #arsip'},
  {id:3,title:'Risk Register',folder:'Security/Risks',content:'Daftar risiko'}
];
test('search finds filenames, full paths, titles, content, tags and links without case sensitivity',async()=>{
  const {searchNotes}=await import(path);
  for(const query of ['Access Policy.md','Security/Policies/Access Policy.md','ACCESS','akses data','#security','Risk Register']) assert.ok(searchNotes(notes,query).some(hit=>hit.note.id===1),query);
  assert.deepEqual(searchNotes(notes,'Security/Policies','folder').map(hit=>hit.note.id),[1]);
  assert.deepEqual(searchNotes(notes,'Audit','content').map(hit=>hit.note.id).sort(),[1,2]);
  assert.equal(searchNotes(notes,'akses','title').length,0);
});
test('operators, phrases, exclusions and multiple words combine across searchable fields',async()=>{
  const {searchNotes}=await import(path);
  assert.deepEqual(searchNotes(notes,'isi:"audit internal" -tag:arsip').map(hit=>hit.note.id),[1]);
  assert.deepEqual(searchNotes(notes,'file:Policy.md folder:Security').map(hit=>hit.note.id),[1]);
  assert.deepEqual(searchNotes(notes,'judul:Meeting').map(hit=>hit.note.id),[2]);
  assert.deepEqual(searchNotes(notes,'tautan:"Risk Register"').map(hit=>hit.note.id),[1]);
  assert.deepEqual(searchNotes(notes,'Security akses').map(hit=>hit.note.id),[1]);
  assert.equal(searchNotes(notes,'"internal audit"').length,0);
});
test('search ranks titles ahead of body matches and snippets expose a late body match',async()=>{
  const {searchNotes,highlight}=await import(path);
  const result=searchNotes([{id:1,title:'Other',content:'x '.repeat(200)+'urgent risk details'},{id:2,title:'Risk',content:''}],'risk');
  assert.equal(result[0].note.id,2);
  assert.ok(result[1].snippet.includes('urgent risk details'));
  assert.ok(result[1].snippet.startsWith('…'));
  assert.deepEqual(highlight('<script>RISK</script>','risk').map(chunk=>chunk.text).join(''),'<script>RISK</script>');
  assert.equal(highlight('RISK risk','risk').filter(chunk=>chunk.match).length,2);
});
test('folder searches reveal files in descendants even with collapsed ancestors',async()=>{
  const {treeRows}=await import('../frontend/client/src/workspace/features/shared/noteTree.mjs');
  const result=treeRows(['Security/Policies'],notes,new Set(),'folder:Policies');
  assert.deepEqual(result.map(row=>row.label||row.note.title),['Security','Policies','Access Policy']);
});
