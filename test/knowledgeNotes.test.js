const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/knowledgeNoteService');
const { pool } = require('../src/config/database');
test('note validation rejects unsafe filenames and excessive content',()=>{
  assert.deepEqual(service.validate({title:' Risk ',content:'[[Policy]]'}),{title:'Risk',content:'[[Policy]]',folder:''});
  for(const title of ['', '../file', 'x|alias', 'a\n', 'x:y']) assert.throws(()=>service.validate({title,content:''}));
  assert.throws(()=>service.validate({title:'Note',content:'a'.repeat(1000001)}));
});
test('folders preserve nested paths and reject traversal before database access',async()=>{
  assert.equal(service.validateFolder('Keamanan/Kebijakan'),'Keamanan/Kebijakan');
  for(const folder of ['../outside','a//b','a/../b','/root','a\\b','a/ b']) assert.throws(()=>service.validateFolder(folder));
  await assert.rejects(()=>service.importNotes([{title:'Valid',content:'',folder:'../bad'}]));
  await assert.rejects(()=>service.importNotes([],['a/../bad']));
});
test('formatting preserves surrounding text and supports multi-line lists',async()=>{
  const {formatSelection,previewBlocks}=await import('../frontend/client/src/workspace/features/shared/noteEditor.mjs');
  assert.deepEqual(formatSelection('one two three',4,7,'bold'),{content:'one **two** three',start:6,end:9});
  assert.equal(formatSelection('one\ntwo',0,7,'ordered').content,'1. one\n2. two');
  assert.equal(formatSelection('',0,0,'italic').content,'*teks*');
  const blocks=previewBlocks('# Heading\n**bold** *italic* ~~strike~~ `code`\n[bad](javascript:alert)\n```\n**plain**\n```');
  assert.equal(blocks[0].type,'h1');
  assert.deepEqual(blocks[1].tokens.filter(t=>t.type!=='text').map(t=>t.type),['bold','italic','strike','code']);
  assert.equal(blocks[2].tokens[0].type,'text');
  assert.equal(blocks[4].type,'codeblock');
  assert.equal(blocks[4].tokens[0].text,'**plain**');
});
test('wiki links support aliases, headings and ignore code',async()=>{
  const {links,graph}=await import('../frontend/client/src/workspace/features/shared/noteLinks.mjs');
  assert.deepEqual(links('[[Policy|P]] [[Policy#Scope]] `[[Code]]`\n```\n[[Example]]\n```'),['Policy']);
  assert.deepEqual(graph([{id:1,title:'Risk',content:'[[policy]] [[Missing]]'},{id:2,title:'Policy',content:'[[Risk]] [[Policy]]'}]),[{source:1,target:2,title:'policy'},{source:2,target:1,title:'Risk'}]);
});
test('duplicate import rolls back the transaction',async()=>{
  const original=pool.connect;const calls=[];let released=false;
  pool.connect=async()=>({query:async(sql)=>{calls.push(sql);if(sql.startsWith('INSERT'))throw Object.assign(new Error('duplicate'),{code:'23505'});return {rows:[]};},release(){released=true;}});
  try {await assert.rejects(()=>service.importNotes([{title:'Policy',content:''}]),{status:409});assert.equal(calls.at(-1),'ROLLBACK');assert.ok(released);}
  finally{pool.connect=original;}
});
test('file tree retains empty folders, collapses descendants and reveals search results',async()=>{
  const {treeRows}=await import('../frontend/client/src/workspace/features/shared/noteTree.mjs');
  const notes=[{id:1,title:'Policy',content:'secret',folder:'Security/Policies'},{id:2,title:'Home',content:'',folder:''}];
  const collapsed=treeRows(['Empty','Security/Policies'],notes,new Set());
  assert.deepEqual(collapsed.map(row=>row.label||row.note.title),['Empty','Security','Home']);
  const open=treeRows(['Empty','Security/Policies'],notes,new Set(['Security','Security/Policies']));
  assert.equal(open.find(row=>row.note?.id===1).depth,2);
  const found=treeRows(['Empty','Security/Policies'],notes,new Set(),'secret');
  assert.deepEqual(found.map(row=>row.label||row.note.title),['Security','Policies','Policy']);
});
test('folder-qualified and Markdown links resolve to saved notes',async()=>{
  const {graph}=await import('../frontend/client/src/workspace/features/shared/noteLinks.mjs');
  const notes=[{id:1,title:'Home',content:'[[Security/Policy.md]]'},{id:2,title:'Policy',folder:'Security',content:''}];
  assert.deepEqual(graph(notes),[{source:1,target:2,title:'Security/Policy.md'}]);
});
test('folder moves reject cycles before acquiring a database connection',async()=>{
  await assert.rejects(()=>service.moveFolder('A','A/B'),{status:400});
  await assert.rejects(()=>service.moveFolder('A','../bad'),{status:400});
  await assert.rejects(()=>service.removeFolder(''),{status:400});
});

test('wiki links generate stable URLs, support aliases and ignore code and missing targets',async()=>{
 const {wikiLinkRanges,noteUrl,noteIdFromHash}=await import('../frontend/client/src/workspace/features/shared/noteNavigation.mjs');
 const notes=[{id:42,title:'Kebijakan',folder:'Security'}];
 const text='[[kebijakan]] [[Security/Kebijakan.md#Bagian|Policy]] `[[kebijakan]]` [[missing]]';
 const ranges=wikiLinkRanges(text,notes);
 assert.equal(ranges.length,2);
 assert.equal(text.slice(ranges[0].from,ranges[0].to),'[[kebijakan]]');
 assert.ok(ranges.every(range=>range.href==='/app#knowledge-note=42'));
 assert.equal(noteIdFromHash('#knowledge-note=42'),'42');
 assert.equal(noteIdFromHash('#knowledge-note=%ZZ'),null);
 assert.equal(noteIdFromHash('#other=42'),null);
 assert.equal(noteUrl('a/b'),'/app#knowledge-note=a%2Fb');
});

test('duplicate titles resolve in the source folder and ambiguous cross-folder links require a path',async()=>{
 const {resolveNote,graph}=await import('../frontend/client/src/workspace/features/shared/noteLinks.mjs');
 const {wikiLinkRanges}=await import('../frontend/client/src/workspace/features/shared/noteNavigation.mjs');
 const notes=[{id:1,title:'Policy',folder:'A',content:''},{id:2,title:'Policy',folder:'B',content:''},{id:3,title:'Home',folder:'B',content:'[[Policy]]'}];
 assert.equal(resolveNote(notes,'Policy','A').id,1);
 assert.equal(resolveNote(notes,'Policy','B').id,2);
 assert.equal(resolveNote(notes,'Policy','Elsewhere'),undefined);
 assert.equal(resolveNote(notes,'A/Policy.md','B').id,1);
 assert.equal(resolveNote(notes,'Missing/Policy.md','B'),undefined);
 assert.deepEqual(graph(notes),[{source:3,target:2,title:'Policy'}]);
 assert.equal(wikiLinkRanges('[[Policy]]',notes,'B')[0].id,'2');
 assert.equal(wikiLinkRanges('[[Policy]]',notes,'Elsewhere').length,0);
 await assert.rejects(service.importNotes([{title:'Same',content:'',folder:'A'},{title:'same',content:'',folder:'A'}]),/duplikat/);
});
