const JSZip = require('jszip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const zlib = require('node:zlib');
const crc = require('crc-32');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const fail=message=>Object.assign(new Error(message),{status:400});
const parse=xml=>{
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw fail('XML template tidak diizinkan.');
  return new DOMParser({onError:()=>{throw fail('XML Word tidak valid.');}}).parseFromString(xml,'application/xml');
};
const serialize=node=>new XMLSerializer().serializeToString(node);
const elements=(node,name)=>Array.from(node.getElementsByTagNameNS(W,name));
const xmlEscape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
async function open(buffer) {
  if(!Buffer.isBuffer(buffer)||buffer.length>5*1024*1024)throw fail('Template Word maksimum 5 MB.');
  await require('./statementZip').validate(buffer);
  let zip;try{zip=await JSZip.loadAsync(buffer);}catch{throw fail('File bukan dokumen DOCX yang valid.');}
  const entries=Object.values(zip.files);
  if(entries.length>600 || entries.reduce((sum,e)=>sum+(e._data?.uncompressedSize||0),0)>25*1024*1024)throw fail('Isi template Word terlalu besar.');
  if(!zip.file('word/document.xml')||!zip.file('[Content_Types].xml'))throw fail('File harus berformat DOCX.');
  if(entries.some(e=>/vbaProject|embeddings\/|activeX\/|\.(?:html?|svg|js|exe|dll)$/i.test(e.name)))throw fail('Template tidak boleh berisi macro, HTML, atau objek tersemat.');
  for(const entry of entries.filter(e=>/\.(?:xml|rels)$/i.test(e.name))){
    const doc=parse(await entry.async('string'));
    const unsafe=/\b(?:DDEAUTO|DDE|INCLUDETEXT|INCLUDEPICTURE|DATABASE|LINK)\b/i;
    const instructions=elements(doc,'instrText').map(n=>n.textContent).join('');
    if(elements(doc,'altChunk').length||elements(doc,'object').length||unsafe.test(instructions)||elements(doc,'fldSimple').some(n=>unsafe.test(n.getAttributeNS(W,'instr'))))throw fail('Template berisi konten aktif atau field eksternal yang tidak didukung.');
    for(const rel of Array.from(doc.getElementsByTagName('*')).filter(n=>n.localName==='Relationship')){
      const target=(rel.getAttribute('Target')||'').trim(),mode=(rel.getAttribute('TargetMode')||'').trim();
      if(/^external$/i.test(mode)||/^(?:[a-z][a-z0-9+.-]*:|[/\\])/i.test(target))throw fail('Template tidak boleh memuat tautan atau sumber eksternal. Hapus tautan eksternal di Word dahulu.');
    }
    for(const node of Array.from(doc.getElementsByTagName('*'))){
      if(/macroEnabled|vbaProject|activeX|oleObject|image\/svg\+xml|text\/html|javascript/i.test(node.getAttribute('ContentType')||node.getAttribute('Type')))throw fail('Konten aktif tidak diizinkan.');
    }
  }
  return zip;
}
// Replace across Word runs while keeping their paragraph/table properties.
function replaceParagraph(p,pattern,mapper){
  const nodes=elements(p,'t'),text=nodes.map(n=>n.textContent).join('');
  const positions=[];let offset=0;for(const n of nodes){positions.push({node:n,start:offset,end:offset+n.textContent.length});offset+=n.textContent.length;}
  const matches=Array.from(text.matchAll(pattern));
  for(const m of matches.reverse()){
    const start=m.index,end=start+m[0].length;let first=true;
    for(const item of positions){if(item.end<=start||item.start>=end)continue;const value=item.node.textContent;const from=Math.max(0,start-item.start),to=Math.min(value.length,end-item.start);item.node.textContent=value.slice(0,from)+(first?mapper(m):'')+value.slice(to);item.node.setAttribute('xml:space','preserve');first=false;}
  }
}
function png(strokes=[],width=800,height=320){
  const pixels=Buffer.alloc(width*height*4);
  const dot=(x,y)=>{for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const px=Math.round(x+dx),py=Math.round(y+dy);if(px<0||px>=width||py<0||py>=height)continue;const i=(py*width+px)*4;pixels[i]=21;pixels[i+1]=40;pixels[i+2]=63;pixels[i+3]=255;}};
  for(const stroke of strokes)for(let i=1;i<stroke.length;i++){const a=stroke[i-1],b=stroke[i],steps=Math.ceil(Math.max(Math.abs(b[0]-a[0])*width,Math.abs(b[1]-a[1])*height));for(let j=0;j<=steps;j++){const t=steps?j/steps:0;dot((a[0]+(b[0]-a[0])*t)*width,(a[1]+(b[1]-a[1])*t)*height);}}
  const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),head=Buffer.alloc(4),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);tail.writeInt32BE(crc.buf(body));return Buffer.concat([head,body,tail]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const raw=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)pixels.copy(raw,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
async function inspect(buffer){const zip=await open(buffer),doc=parse(await zip.file('word/document.xml').async('string'));const body=elements(doc,'p').map(p=>elements(p,'t').map(t=>t.textContent).join('')).join('\n');const placeholders=[...new Set(Array.from(body.matchAll(/\{\{([a-z][a-z0-9_]{0,39})\}\}/g),m=>m[1]))];return {body,placeholders};}
async function forEditor(buffer){
  const zip=await open(buffer);
  const defaults=await open(await require('node:fs/promises').readFile(require('node:path').join(__dirname,'../../templates/statements/1.docx')));
  const types=parse(await zip.file('[Content_Types].xml').async('string'));
  const relPath='word/_rels/document.xml.rels',ns='http://schemas.openxmlformats.org/package/2006/relationships';
  const rels=parse(zip.file(relPath)?await zip.file(relPath).async('string'):`<Relationships xmlns="${ns}"/>`);
  for(const name of ['styles','settings','numbering','fontTable']){
    const part='word/'+name+'.xml';if(zip.file(part))continue;
    if(!defaults.file(part))continue;
    zip.file(part,await defaults.file(part).async('nodebuffer'));
    const type=types.createElementNS(types.documentElement.namespaceURI,'Override');type.setAttribute('PartName','/'+part);type.setAttribute('ContentType','application/vnd.openxmlformats-officedocument.wordprocessingml.'+name+'+xml');types.documentElement.appendChild(type);
    const rel=rels.createElementNS(ns,'Relationship');rel.setAttribute('Id','rIdEditor'+name);rel.setAttribute('Type',R+'/'+name);rel.setAttribute('Target',name+'.xml');rels.documentElement.appendChild(rel);
  }
  zip.file('[Content_Types].xml',serialize(types));zip.file(relPath,serialize(rels));
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
async function normalizeSeed(buffer){
  const zip=await open(buffer);const doc=parse(await zip.file('word/document.xml').async('string'));
  const replacements={'<Tetap/Kontrak/Outsource>':'{{status}}','Tetap/Kontrak/Outsource':'{{status}}','<nama>':'{{nama}}','<nip>':'{{nip}}','<jabatan>':'{{jabatan}}','<penyedia jasa tenaga kerja>':'{{penyedia}}','Jakarta, 16 Oktober 2026':'{{tempat}}, {{tanggal}}','(Lukmanul Hakim)':'({{nama}})'};
  for(const p of elements(doc,'p'))for(const [from,to] of Object.entries(replacements))replaceParagraph(p,new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),()=>to);
  const labels={'Nama':'nama','NIP':'nip','Jabatan':'jabatan','Nama Penyedia Jasa Tenaga Kerja':'penyedia'};
  for(const row of elements(doc,'tr')){
    const cells=Array.from(row.childNodes).filter(n=>n.localName==='tc');if(cells.length<2)continue;
    const label=elements(cells[0],'t').map(n=>n.textContent).join('').trim();const key=labels[label];if(!key)continue;
    const cell=cells.length>=3?cells[2]:cells[1],nodes=elements(cell,'t');
    if(nodes.length){nodes[0].textContent=(cells.length===2?': ':'')+'{{'+key+'}}';nodes.slice(1).forEach(n=>{n.textContent='';});}
  }
  // These source documents use rId9 for the sample handwritten signature.
  const rels=parse(await zip.file('word/_rels/document.xml.rels').async('string'));
  const signature=Array.from(rels.documentElement.childNodes).find(n=>n.getAttribute?.('Id')==='rId9');
  if(signature){const target=signature.getAttribute('Target');zip.file('word/'+target,png());}
  zip.file('word/document.xml',serialize(doc));
  zip.file('statement-template.json',JSON.stringify({source:'bundled',version:1}));
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
function signatureRun(){return `<w:r xmlns:w="${W}"><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="1828800" cy="731520"/><wp:docPr id="987654" name="Tanda tangan"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Tanda tangan"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="${R}" r:embed="rIdStatementSignature"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1828800" cy="731520"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;}
async function generate(buffer,data={},strokes=[],{preview=false}={}){
  const zip=await open(buffer),signatureImage=data.signatureImage?Buffer.from(data.signatureImage.split(',')[1],'base64'):png(strokes),emptySignature=png();
  const parts=[];
  for(const entry of Object.values(zip.files).filter(e=>/^word\/(document|header\d+|footer\d+)\.xml$/.test(e.name)))parts.push({name:entry.name,doc:parse(await entry.async('string'))});
  const explicitPlacement=parts.some(part=>elements(part.doc,'p').some(p=>elements(p,'t').map(n=>n.textContent).join('').includes('{{tanda_tangan}}')));
  // Explicit cursor positions override the sample document's old signature slots.
  if(!explicitPlacement){
    for(const image of Object.values(zip.files).filter(e=>/^word\/media\/.+\.png$/i.test(e.name))){const content=await image.async('nodebuffer');if(content.equals(emptySignature))zip.file(image.name,signatureImage);}
    if(zip.file('statement-template.json')&&zip.file('word/_rels/document.xml.rels')){const rels=parse(await zip.file('word/_rels/document.xml.rels').async('string'));const rel=Array.from(rels.documentElement.childNodes).find(n=>n.getAttribute?.('Id')==='rId9');if(rel)zip.file('word/'+rel.getAttribute('Target'),signatureImage);}
  }
  let signatureId=987654,hasSignature=false;
  const usedIds=new Set(parts.flatMap(part=>Array.from(part.doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing','docPr'),n=>n.getAttribute('id'))));
  for(const part of parts){
    let needsSignature=false;
    for(const p of elements(part.doc,'p')){
      replaceParagraph(p,/\{\{tanda_tangan\}\}/g,()=>String.fromCharCode(0xE000));
      for(const text of elements(p,'t')){
        if(!text.textContent.includes(String.fromCharCode(0xE000)))continue;
        const pieces=text.textContent.split(String.fromCharCode(0xE000)),run=text.parentNode,reference=text.nextSibling;
        text.textContent=pieces[0];text.setAttribute('xml:space','preserve');
        for(const piece of pieces.slice(1)){
          const fragment=parse(signatureRun());const drawing=fragment.getElementsByTagNameNS(W,'drawing')[0];
          while(usedIds.has(String(signatureId)))signatureId++;const drawingId=String(signatureId++);usedIds.add(drawingId);
          drawing.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing','docPr')[0].setAttribute('id',drawingId);
          run.insertBefore(part.doc.importNode(drawing,true),reference);
          const tail=part.doc.createElementNS(W,'w:t');tail.setAttribute('xml:space','preserve');tail.textContent=piece;run.insertBefore(tail,reference);needsSignature=true;hasSignature=true;
        }
      }
      replaceParagraph(p,/\{\{([a-z][a-z0-9_]{0,39})\}\}/g,m=>Object.hasOwn(data,m[1])?String(data[m[1]]||'-'):(preview?m[0]:'-'));
    }
    zip.file(part.name,serialize(part.doc));
    if(needsSignature){
      const relPath='word/_rels/'+part.name.split('/').pop()+'.rels',ns='http://schemas.openxmlformats.org/package/2006/relationships';
      const rels=parse(zip.file(relPath)?await zip.file(relPath).async('string'):'<Relationships xmlns="'+ns+'"/>');
      const existing=Array.from(rels.documentElement.childNodes).find(n=>n.getAttribute?.('Id')==='rIdStatementSignature');
      const rel=existing||rels.createElementNS(ns,'Relationship');rel.setAttribute('Id','rIdStatementSignature');rel.setAttribute('Type',R+'/image');rel.setAttribute('Target','media/statement-signature.png');if(!existing)rels.documentElement.appendChild(rel);zip.file(relPath,serialize(rels));
    }
  }
  if(hasSignature){
    zip.file('word/media/statement-signature.png',signatureImage);
    const content=parse(await zip.file('[Content_Types].xml').async('string'));
    if(!Array.from(content.documentElement.childNodes).some(n=>n.getAttribute?.('Extension')==='png')){const def=content.createElementNS('http://schemas.openxmlformats.org/package/2006/content-types','Default');def.setAttribute('Extension','png');def.setAttribute('ContentType','image/png');content.documentElement.appendChild(def);zip.file('[Content_Types].xml',serialize(content));}
  }
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
async function plain(body){const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('_rels/.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/></Relationships>`);zip.file('word/document.xml',`<w:document xmlns:w="${W}"><w:body>${(body+'\n\n{{tempat}}, {{tanggal}}\n{{tanda_tangan}}\n{{nama}}').split('\n').map(line=>`<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);return zip.generateAsync({type:'nodebuffer'});}
module.exports={inspect,normalizeSeed,generate,plain,png,forEditor};
