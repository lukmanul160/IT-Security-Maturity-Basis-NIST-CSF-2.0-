const test=require('node:test');
const assert=require('node:assert/strict');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJz8AAAAASUVORK5CYII=','base64');
test('exact long image9 reference resolves only when its file exists and reports missing files outside code',async()=>{
 const {missingImageReferences,imageEmbedRanges}=await import('../frontend/client/src/workspace/features/shared/noteImages.mjs');
 const path='PT BRI Asuransi Indonesia/Draft/SOP IT Security and Network/Attachments/media/image9.png';
 const reference='![['+path+']]';
 assert.deepEqual(missingImageReferences(reference,[]),[path]);
 assert.deepEqual(missingImageReferences('`'+reference+'`\n```\n'+reference+'\n```',[]),[]);
 const images=[{id:'image9',path}];
 assert.deepEqual(missingImageReferences(reference,images),[]);
 assert.equal(imageEmbedRanges(reference,images)[0].attrs.src,'/api/knowledge-notes/images/image9');
});
test('moving images updates resolved references and preserves code, widths and other images',async()=>{
 const {moveImageReferences}=await import('../frontend/client/src/workspace/features/shared/noteImages.mjs');
 const images=[{id:'a',path:'A/pic.png'},{id:'b',path:'B/pic.png'}];
 const content='![[pic.png|320]] ![[B/pic.png]] ![Photo](pic.png) `![[pic.png]]`\n```\n![[pic.png]]\n```';
 assert.equal(moveImageReferences(content,images,'a','Target/pic.png','A'),'![[Target/pic.png|320]] ![[B/pic.png]] ![Photo](<Target/pic.png>) `![[pic.png]]`\n```\n![[pic.png]]\n```');
});
test('image mutations reject invalid IDs and folder traversal',async()=>{
 const images=require('../src/services/knowledgeImageService');
 await assert.rejects(()=>images.remove('invalid'),{status:404});
 await assert.rejects(()=>images.move('invalid','A'),{status:404});
 await assert.rejects(()=>images.move('00000000-0000-0000-0000-000000000000','../bad'),{status:400});
 await assert.rejects(()=>images.move('00000000-0000-0000-0000-000000000000'),{status:400});
});
test('vault paths resolve beneath an imported root and completed embeds become image nodes',async()=>{
 const {resolveImage,imageEmbedRanges,displayImageMarkdown}=await import('../frontend/client/src/workspace/features/shared/noteImages.mjs');
 const path='PT BRI Asuransi Indonesia/Draft/SOP IT Security and Network/Attachments/media/image10.png';
 const images=[{id:'a1',path:'Imported Vault/'+path}];
 assert.equal(resolveImage(images,path).id,'a1');
 assert.ok(displayImageMarkdown('![[ '+path+' ]]',images).includes('/api/knowledge-notes/images/a1'));
 assert.equal(resolveImage([...images,{id:'b2',path:'Another/'+path}],path),undefined);
 assert.deepEqual(imageEmbedRanges('![[missing.png]]',images),[]);
 assert.deepEqual(imageEmbedRanges('![[ '+path,images),[]);
 const text='Before ![['+path+'|300]] after';
 const ranges=imageEmbedRanges(text,images);
 assert.equal(ranges.length,1);
 assert.equal(ranges[0].attrs.width,300);
 const {getSchema}=await import('@tiptap/core');
 const {default:StarterKit}=await import('@tiptap/starter-kit');
 const {NoteImage}=await import('../frontend/client/src/workspace/features/shared/noteImageExtension.mjs');
 const {EditorState}=await import('@tiptap/pm/state');
 const schema=getSchema([StarterKit,NoteImage]);
 const state=EditorState.create({schema,doc:schema.node('doc',null,[schema.node('paragraph',null,[schema.text(text)])])});
 const range=ranges[0];
 const doc=state.tr.replaceRangeWith(1+range.from,1+range.to,schema.nodes.image.create(range.attrs)).doc;
 doc.check();
 assert.equal(doc.child(1).type.name,'image');
 assert.equal(doc.textContent,'Before  after');
});
test('image imports validate bytes and prevent invalid paths and active-content formats',()=>{
 const {validate}=require('../src/services/knowledgeImageService');
 assert.equal(validate({path:'Vault/Images/a.png',content:png}).type,'image/png');
 for(const path of ['../a.png','/a.png','a.svg','a.jpg'])assert.throws(()=>validate({path,content:png}));
 assert.throws(()=>validate({path:'a.png',content:Buffer.from('<script>alert(1)</script>')}));
});
test('Obsidian embeds and relative Markdown images resolve to authenticated images without changing code',async()=>{
 const {displayImageMarkdown,restoreImageMarkdown,resolveImage}=await import('../frontend/client/src/workspace/features/shared/noteImages.mjs');
 const images=[{id:'a1',path:'Vault/Images/photo.png'},{id:'b2',path:'Other/photo.png'}];
 assert.equal(resolveImage(images,'../Images/photo.png','Vault/Notes').id,'a1');
 assert.equal(resolveImage(images,'photo.png','Elsewhere'),undefined);
 const content='![[../Images/photo.png|300]]\n![Photo](../Images/photo.png)\n`![[photo.png]]`\n```\n![[photo.png]]\n```';
 const shown=displayImageMarkdown(content,images,'Vault/Notes');
 assert.equal((shown.match(/\/api\/knowledge-notes\/images\/a1/g)||[]).length,2);
 assert.ok(shown.includes('`![[photo.png]]`'));
 assert.ok(restoreImageMarkdown(shown,images).includes('![[Vault/Images/photo.png]]'));
 const {links}=await import('../frontend/client/src/workspace/features/shared/noteLinks.mjs');
 assert.deepEqual(links('![[photo.png]] [[Policy]]'),['Policy']);
});
test('Tiptap parses and serializes an imported image as an image node',async()=>{
 const {MarkdownManager}=await import('@tiptap/markdown');
 const {default:StarterKit}=await import('@tiptap/starter-kit');
 const {default:Image}=await import('@tiptap/extension-image');
 const manager=new MarkdownManager({extensions:[StarterKit,Image]});
 const document=manager.parse('![Photo](/api/knowledge-notes/images/a1)');
 assert.ok(JSON.stringify(document).includes('"type":"image"'));
 assert.ok(manager.serialize(document).includes('/api/knowledge-notes/images/a1'));
});


test('image display widths survive Obsidian embeds, Markdown serialization and reload', async () => {
 const { displayImageMarkdown, restoreImageMarkdown } = await import('../frontend/client/src/workspace/features/shared/noteImages.mjs');
 const { NoteImage } = await import('../frontend/client/src/workspace/features/shared/noteImageExtension.mjs');
 const { MarkdownManager } = await import('@tiptap/markdown');
 const { default: StarterKit } = await import('@tiptap/starter-kit');
 const manager = new MarkdownManager({ extensions: [StarterKit, NoteImage] });
 const images = [{ id:'a1', path:'Images/photo.png' }];
 const shown = displayImageMarkdown('![[Images/photo.png|180]]', images);
 const doc = manager.parse(shown);
 const image = doc.content.find(node => node.type === 'image') || doc.content[0].content.find(node => node.type === 'image');
 assert.equal(image.attrs.width,180);
 image.attrs.width=480;
 const stored = restoreImageMarkdown(manager.serialize(doc),images);
 assert.equal(stored,'![[Images/photo.png|480]]');
 const reloaded=manager.parse(displayImageMarkdown(stored,images));
 assert.ok(JSON.stringify(reloaded).includes('"width":480'));
 assert.equal(restoreImageMarkdown(displayImageMarkdown('`![[Images/photo.png|180]]`',images),images),'`![[Images/photo.png|180]]`');
});
