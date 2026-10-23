const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const JSZip=require('jszip');
const {DOMParser,XMLSerializer}=require('@xmldom/xmldom');
const documents=require('../src/services/statementDocumentService'),fields=require('../src/services/statementFields');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const parse=xml=>new DOMParser().parseFromString(xml,'application/xml');
test('downloadable starter template contains the supported identity/date/signature placeholders',async()=>{
 const buffer=await fs.readFile(path.join(__dirname,'../templates/statements/example.docx'));const meta=await documents.inspect(buffer);
 for(const key of ['nama','nip','status','jabatan','penyedia','tempat','tanggal','tanda_tangan'])assert.ok(meta.placeholders.includes(key),key);
 const rendered=await documents.generate(buffer,{nama:'Pengisi',nip:'333',status:'Tetap',jabatan:'Staf',penyedia:'-',tempat:'Jakarta',tanggal:'2026-10-17'},[[[.1,.1],[.5,.5]]]);
 const filled=await JSZip.loadAsync(rendered);assert.ok(filled.file('word/media/statement-signature.png'));assert.ok((await documents.inspect(rendered)).body.includes('Pengisi'));
});
test('all three original Word templates preserve page/table/numbering/header/footer styles and replace sample identity/signature',async()=>{
 for(let i=1;i<=3;i++){
  const source=await fs.readFile(path.join(__dirname,`../templates/statements/${i}.docx`)),original=await JSZip.loadAsync(source);
  const meta=await documents.inspect(source);assert.ok(meta.placeholders.includes('nama'));assert.ok(meta.placeholders.includes('tanggal'));assert.ok(!/Lukmanul Hakim|Lukmaul Hakim|25992005|Tem Member|Team Member/.test(meta.body));
  const output=await documents.generate(source,{nama:'Siti <A> & B',nip:'333',jabatan:'Analis',status:'Kontrak',penyedia:'',tempat:'Bandung',tanggal:'2026-10-18'},[[[.1,.2],[.3,.7],[.6,.1]]]);
  const filled=await JSZip.loadAsync(output);
  const before=parse(await original.file('word/document.xml').async('string')),after=parse(await filled.file('word/document.xml').async('string'));
  const serial=new XMLSerializer();
  for(const tag of ['sectPr','tblPr','tblGrid','pPr','rPr'])assert.deepEqual(Array.from(after.getElementsByTagNameNS(W,tag),n=>serial.serializeToString(n)),Array.from(before.getElementsByTagNameNS(W,tag),n=>serial.serializeToString(n)),tag+' properties preserved');
  for(const part of ['word/styles.xml','word/numbering.xml','word/header1.xml','word/footer1.xml']){
   if(!original.file(part))continue;
   const a=await original.file(part).async('string'),b=await filled.file(part).async('string');
   assert.equal(serial.serializeToString(parse(a)),serial.serializeToString(parse(b)),part+' preserved');
  }
  const text=Array.from(after.getElementsByTagNameNS(W,'t'),n=>n.textContent).join('');assert.ok(text.includes('Siti <A> & B'));assert.ok(text.includes('333'));assert.ok(!text.includes('{{nama}}'));assert.ok(!text.includes('Lukmanul Hakim'));
  assert.notDeepEqual(await original.file('word/media/image1.png').async('nodebuffer'),await filled.file('word/media/image1.png').async('nodebuffer'));
 }
});
test('Word replacements span runs, escape field text, and embed a real signature PNG',async()=>{
 const zip=await JSZip.loadAsync(await documents.plain('Nama {{nama}} NIP {{nip}} Unit {{unit}}'));
 let xml=await zip.file('word/document.xml').async('string');xml=xml.replace('{{nama}}','{{na</w:t></w:r><w:r><w:t>ma}}');zip.file('word/document.xml',xml);
 const result=await documents.generate(await zip.generateAsync({type:'nodebuffer'}),{nama:'A & <B>',nip:'333',unit:'IT'},[[[0,0],[1,1]]]);
 const filled=await JSZip.loadAsync(result);const text=await filled.file('word/document.xml').async('string');
 assert.ok(text.includes('A &amp; &lt;B&gt;'));assert.ok(text.includes('IT'));assert.ok(!text.includes('{{na'));
 assert.ok((await filled.file('word/media/statement-signature.png').async('nodebuffer')).subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])));
 assert.match(await filled.file('word/_rels/document.xml.rels').async('string'),/rIdStatementSignature/);
});
test('signatures still fill after a document editor renames images and removes custom package entries',async()=>{
 const source=await fs.readFile(path.join(__dirname,'../templates/statements/1.docx'));
 const zip=await JSZip.loadAsync(source);zip.remove('statement-template.json');const image=await zip.file('word/media/image1.png').async('nodebuffer');zip.file('word/media/renamed-signature.png',image);zip.remove('word/media/image1.png');
 const rel=await zip.file('word/_rels/document.xml.rels').async('string');zip.file('word/_rels/document.xml.rels',rel.replace('media/image1.png','media/renamed-signature.png'));
 const result=await documents.generate(await zip.generateAsync({type:'nodebuffer'}),{nama:'A',nip:'333'},[[[.1,.1],[.6,.5]]]);const generated=await JSZip.loadAsync(result);assert.notDeepEqual(await generated.file('word/media/renamed-signature.png').async('nodebuffer'),image);
});
test('signature images occupy exact inline, table-cell and header cursor positions',async()=>{
 const zip=await JSZip.loadAsync(await documents.plain('Sebelum {{tanda_tangan}} sesudah'));
 let xml=await zip.file('word/document.xml').async('string');xml=xml.replace('{{tanda_tangan}}','{{tanda_</w:t></w:r><w:r><w:t>tangan}}');xml=xml.replace('<w:sectPr>','<w:tbl><w:tr><w:tc><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>Kiri {{tanda_tangan}} kanan</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr>');zip.file('word/document.xml',xml);
 zip.file('word/header1.xml',`<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>Atas {{tanda_tangan}} bawah</w:t></w:r></w:p></w:hdr>`);
 const result=await documents.generate(await zip.generateAsync({type:'nodebuffer'}),{},[[[.1,.1],[.6,.5]]]);const output=await JSZip.loadAsync(result);const doc=parse(await output.file('word/document.xml').async('string'));
 const ordered=p=>Array.from(p.getElementsByTagNameNS(W,'r')).flatMap(run=>Array.from(run.childNodes).filter(n=>['t','drawing'].includes(n.localName)).map(n=>n.localName==='drawing'?'[SIGN]':n.textContent)).join('');
 assert.equal(ordered(doc.getElementsByTagNameNS(W,'p')[0]),'Sebelum [SIGN] sesudah');
 const table=doc.getElementsByTagNameNS(W,'tc')[0];assert.equal(ordered(table.getElementsByTagNameNS(W,'p')[0]),'Kiri [SIGN] kanan');assert.equal(table.getElementsByTagNameNS(W,'jc')[0].getAttribute('w:val'),'right');
 const header=parse(await output.file('word/header1.xml').async('string'));assert.equal(ordered(header.getElementsByTagNameNS(W,'p')[0]),'Atas [SIGN] bawah');assert.match(await output.file('word/_rels/header1.xml.rels').async('string'),/rIdStatementSignature/);
 const ids=[...Array.from(doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing','docPr'),n=>n.getAttribute('id')),...Array.from(header.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing','docPr'),n=>n.getAttribute('id'))];assert.equal(new Set(ids).size,ids.length);
});
test('explicit signature placement overrides legacy sample slots instead of duplicating the signature',async()=>{
 const zip=await JSZip.loadAsync(await fs.readFile(path.join(__dirname,'../templates/statements/1.docx')));const blank=await zip.file('word/media/image1.png').async('nodebuffer');let xml=await zip.file('word/document.xml').async('string');xml=xml.replace('<w:sectPr','<w:p><w:r><w:t>{{tanda_tangan}}</w:t></w:r></w:p><w:sectPr');zip.file('word/document.xml',xml);
 const result=await documents.generate(await zip.generateAsync({type:'nodebuffer'}),{nama:'A',nip:'333'},[[[.1,.1],[.6,.5]]]);const output=await JSZip.loadAsync(result);assert.deepEqual(await output.file('word/media/image1.png').async('nodebuffer'),blank);assert.notDeepEqual(await output.file('word/media/statement-signature.png').async('nodebuffer'),blank);
});
test('custom field settings enforce allowed values and keep NIP/name for grouping',()=>{
 const config=[...fields.defaults,{key:'unit',label:'Unit kerja',type:'select',required:true,options:['IT','Risk']},{key:'email_kantor',label:'Email',type:'email',required:false}];
 assert.equal(fields.normalize(config).length,9);
 const input={nama:'A',nip:'333',status:'Tetap',jabatan:'Staf',tempat:'Jakarta',tanggal:'2026-10-17',unit:'IT'};
 assert.equal(fields.values({...input,unconfigured:'ignored'},config).unit,'IT');assert.equal(fields.values(input,config).unconfigured,undefined);
 assert.throws(()=>fields.values({...input,unit:'Lainnya'},config),{status:400});assert.throws(()=>fields.values({...input,unit:''},config),{status:400});assert.throws(()=>fields.values({...input,email_kantor:'bad'},config),{status:400});
 assert.throws(()=>fields.normalize(config.filter(f=>f.key!=='nip')),{status:400});assert.throws(()=>fields.normalize([...config,{key:'constructor',label:'Bad',type:'text',required:false}]),{status:400});
 const fixed=config.map(f=>f.key==='jabatan'?{...f,public:false,value:'Petugas'}:f);assert.equal(fields.values({...input,jabatan:'Tampered'},fixed).jabatan,'Petugas');
 assert.throws(()=>fields.normalize(config.map(f=>f.key==='nip'?{...f,public:false,value:'111'}:f)),{status:400});
});
test('rejects oversized, invalid, embedded executable and external-resource Word files',async()=>{
 await assert.rejects(()=>documents.inspect(Buffer.from('not a Word file')),{status:400});
 await assert.rejects(()=>documents.inspect(Buffer.alloc(50*1024*1024+1)),{status:413});
 const zip=await JSZip.loadAsync(await documents.plain('Hello'));
 zip.file('word/_rels/document.xml.rels','<Relationships><Relationship TargetMode="External" Target="https://example.com"/></Relationships>');
 await assert.rejects(()=>zip.generateAsync({type:'nodebuffer'}).then(documents.inspect),{status:400});
 zip.remove('word/_rels/document.xml.rels');zip.file('word/vbaProject.bin',Buffer.from('not allowed'));
 await assert.rejects(()=>zip.generateAsync({type:'nodebuffer'}).then(documents.inspect),{status:400});
});

test('uploaded raster signature is embedded at the configured cursor position',async()=>{
 const image=documents.png([[[.1,.2],[.5,.7],[.9,.1]]]);const buffer=await documents.generate(await documents.plain('Surat'),{signatureImage:'data:image/png;base64,'+image.toString('base64')});const zip=await JSZip.loadAsync(buffer);assert.deepEqual(await zip.file('word/media/statement-signature.png').async('nodebuffer'),image);
});

test('rejects encoded external relationships, split field instructions and active fields outside the main body',async()=>{
 const base=await documents.plain('Safe');
 const cases=[
  ['word/_rels/document.xml.rels','<Relationships><Relationship TargetMode="Exter&#110;al" Target="https://example.com"/></Relationships>'],
  ['word/_rels/document.xml.rels','<Relationships><Relationship Target="file:///secret"/></Relationships>'],
  ['word/header1.xml',`<w:hdr xmlns:w="${W}"><w:fldSimple w:instr="DDEAUTO cmd"/></w:hdr>`],
  ['word/footer1.xml',`<w:ftr xmlns:w="${W}"><w:r><w:instrText>INCLUDE</w:instrText></w:r><w:r><w:instrText>TEXT secret</w:instrText></w:r></w:ftr>`],
  ['word/header1.xml',`<!DOCTYPE x [<!ENTITY e "bad">]><w:hdr xmlns:w="${W}"/>`],
  ['word/media/image.svg','<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'],
  ['[Content_Types].xml','<Types><Default Extension="png" ContentType="image/svg+xml"/></Types>']
 ];
 for(const [name,xml] of cases){const zip=await JSZip.loadAsync(base);zip.file(name,xml);await assert.rejects(()=>zip.generateAsync({type:'nodebuffer'}).then(documents.inspect),{status:400},name);}
});

test('ZIP validation bounds actual inflated size and rejects forged size headers',async()=>{
 const validate=require('../src/services/statementZip').validate;
 const zip=new JSZip();zip.file('payload',Buffer.alloc(2048));
 const buffer=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 await assert.rejects(()=>validate(buffer,{maxBytes:1024}),{status:400});
 const forged=Buffer.from(buffer),central=forged.indexOf(Buffer.from('504b0102','hex'));
 forged.writeUInt32LE(1,central+24);
 await assert.rejects(()=>validate(forged),{status:400});
 await assert.rejects(()=>validate(buffer,{maxEntries:0}),{status:400});
});
test('minimal DOCX files receive optional parts needed by the Word editor without changing their content',async()=>{
 const source=await documents.plain('Minimal policy');
 const output=await documents.forEditor(source),zip=await JSZip.loadAsync(output);
 for(const part of ['styles','settings','numbering','fontTable'])assert.ok(zip.file('word/'+part+'.xml'));
 assert.equal((await documents.inspect(output)).body,(await documents.inspect(source)).body);
});
