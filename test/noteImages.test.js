const test=require('node:test');
const assert=require('node:assert/strict');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJz8AAAAASUVORK5CYII=','base64');
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
