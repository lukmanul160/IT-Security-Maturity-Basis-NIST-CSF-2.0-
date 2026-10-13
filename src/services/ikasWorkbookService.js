const fs=require('node:fs');
const XLSX=require('xlsx');
const {seed}=require('./ikasService');
const scoring=require('../shared/ikasScoring');
const zip=require('./ikasTemplateZip');
const path=require('node:path');
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const clean=value=>String(value??'').trim().replace(/\s+/g,' ');
const escape=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]));
const decode=value=>value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[entity]??String.fromCodePoint(entity[2].toLowerCase()==='x'?parseInt(entity.slice(3,-1),16):Number(entity.slice(2,-1)))));
function sheetPaths(buffer){
  const rows=new Map(zip.entries(buffer).rows.map(row=>[row.name,row.content.toString('utf8')]));
  const relationships=new Map([...rows.get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]+)\/?\s*>/g)].map(match=>{const attrs=Object.fromEntries([...match[1].matchAll(/([\w:]+)="([^"]*)"/g)].map(item=>[item[1],decode(item[2])]));return [attrs.Id,path.posix.normalize(attrs.Target.startsWith('/')?attrs.Target.slice(1):'xl/'+attrs.Target)];}));
  return new Map([...rows.get('xl/workbook.xml').matchAll(/<sheet\b([^>]+)\/?\s*>/g)].map(match=>{const attrs=Object.fromEntries([...match[1].matchAll(/([\w:]+)="([^"]*)"/g)].map(item=>[item[1],decode(item[2])]));return [attrs.name,relationships.get(attrs['r:id'])];}));
}
function domainFor(name){
  const text=clean(name).toLowerCase();return /identifikasi/.test(text)?seed.domains[0]:/proteksi/.test(text)?seed.domains[1]:/deteksi/.test(text)?seed.domains[2]:/gulih|penanggulangan.*pemulihan/.test(text)?seed.domains[3]:null;
}
function parse(book,selected){
  const controls=[],scores={},notes={},applicability={},domains=[];
  for(const name of book.SheetNames){
    const domain=domainFor(name);if(!domain||selected&&!selected.includes(domain.name))continue;
    if(domains.includes(domain.name))throw fail('Sheet domain duplikat: '+domain.name);domains.push(domain.name);
    const sheet=book.Sheets[name],range=XLSX.utils.decode_range(sheet['!ref']||'A1');if(range.e.r>5000)throw fail('Domain Excel terlalu besar.');
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,range:{s:{r:0,c:0},e:{r:range.e.r,c:Math.max(range.e.c,10)}},defval:''});
    let category,subcategory,subcategoryId,previousHeader,scoreColumn=3,notesColumn=10,scopeColumn=2,rubricColumns=[4,5,6,7,8,9];
    rows.forEach((row,index)=>{
      const label=clean(row[0]);
      if(/^kategori\s+\d+/i.test(label)){category=label.match(/\d+\.\d+/)?.[0]+': '+clean(row[1]);return;}
      if(/^sub\s*kategori\s+\d+/i.test(label)){
        subcategoryId=label.match(/\d+\.\d+\.\d+/)?.[0];subcategory=clean(row[1]);
        scoreColumn=row.findIndex(value=>/^indeks\s+nilai\s+kematangan$/i.test(clean(value)));notesColumn=row.findIndex(value=>/^keterangan\s+validasi$/i.test(clean(value)));scopeColumn=row.findIndex(value=>/^ruang\s+lingkup$/i.test(clean(value)));
        rubricColumns=[0,1,2,3,4,5].map(value=>row.findIndex(text=>new RegExp('^indeks\\s+'+value+'$','i').test(clean(text))));
        rubricColumns=rubricColumns.map((column,value)=>{
          if(column>=0)return column;
          const candidate=rubricColumns[value+1]>=0?rubricColumns[value+1]-1:rubricColumns[value-1]>=0?rubricColumns[value-1]+1:-1;
          return candidate>=0&&clean(row[candidate])===''?candidate:-1;
        });
        // Some completed workbooks omit a repeated validation header (for example K82).
        // Recover only a blank cell in an otherwise identical, previously verified layout.
        if(notesColumn<0&&previousHeader&&scoreColumn===previousHeader.scoreColumn&&scopeColumn===previousHeader.scopeColumn&&rubricColumns.every((column,value)=>column===previousHeader.rubricColumns[value])&&clean(row[previousHeader.notesColumn])==='')notesColumn=previousHeader.notesColumn;
        if(!subcategoryId||scoreColumn<0||notesColumn<0||scopeColumn<0||rubricColumns.some(value=>value<0))throw fail('Header indeks, validasi, atau rubrik tidak lengkap pada '+name+' baris '+(index+1));
        previousHeader={scoreColumn,notesColumn,scopeColumn,rubricColumns:[...rubricColumns]};return;
      }
      if(!/^[a-z]{1,3}$/i.test(label)||!row[1])return;
      if(!category||!subcategoryId)throw fail('Struktur subkategori tidak tersedia pada '+name+' baris '+(index+1));
      const id='IKAS-'+subcategoryId+'-'+label.toLowerCase();if(controls.some(row=>row.id===id))throw fail('Identitas pertanyaan duplikat: '+id);
      const rubric=rubricColumns.map(column=>String(row[column]??'').trim());if(rubric.some(value=>!value))throw fail('Enam rubrik indeks wajib tersedia pada '+id);
      const value=row[scoreColumn],numeric=typeof value==='number'?value:typeof value==='string'&&/^\d$/.test(value.trim())?Number(value):null;
      if(clean(value)==='')applicability[id]='Applicable';
      else if(/^not\s*applicab(?:le|ility)$/i.test(clean(value)))applicability[id]='Not applicable';
      else if(Number.isInteger(numeric)&&numeric>=0&&numeric<=5){scores[id]=numeric;applicability[id]='Applicable';}
      else throw fail('Indeks '+id+' harus 0–5, kosong, atau Not Applicable.');
      notes[id]=String(row[notesColumn]??'');
      controls.push({id,function:domain.name,category,subcategory:clean(row[1]),implementation:rubric.map((text,value)=>'Indeks '+value+':\n'+text).join('\n\n'),references:'IKAS / '+name+' / baris '+(index+1)+' / Sub Kategori '+subcategoryId+': '+subcategory,minimumEvidence:'',notes:'',evidence:[],applicability:applicability[id],ikas:{subcategoryId,subcategory,scope:clean(row[scopeColumn]),rubric,sourceSheet:name,sourceRow:index+1,scoreColumn,notesColumn,weight:domain.weight}});
    });
    if(!controls.some(row=>row.function===domain.name))throw fail('Tidak ada pertanyaan pada domain '+domain.name);
  }
  if(!domains.length)throw fail('Tidak ada sheet Identifikasi, Proteksi, Deteksi, atau Gulih yang dipilih.');
  return {controls,scores,notes,applicability,domains};
}
function read(buffer,selected){
  let book;try{zip.entries(buffer);book=XLSX.read(buffer,{type:'buffer'});}catch(error){throw fail('File Excel IKAS tidak valid: '+error.message);}
  if(selected!==undefined&&(!Array.isArray(selected)||!selected.length||selected.some(name=>!seed.domains.some(domain=>domain.name===name))))throw fail('Pilih domain import IKAS yang valid.');
  const data=parse(book,selected),allDomains=book.SheetNames.map(domainFor).filter(Boolean);
  if(selected?.some(name=>!data.domains.includes(name)))throw fail('Domain yang dipilih tidak tersedia dalam file Excel.');
  if(book.Sheets.Responden){
    data.respondent=Object.fromEntries(seed.respondentFields.map(field=>[field.cell,String(book.Sheets.Responden[field.cell]?.v??'')]));
    data.targetScore=data.respondent.D15.trim()===''?undefined:Number(data.respondent.D15);
    if(data.targetScore!==undefined&&(!Number.isFinite(data.targetScore)||data.targetScore<0||data.targetScore>5))throw fail('Target Nilai IKAS harus antara 0 dan 5.');
  }
  if(new Set(allDomains.map(domain=>domain.name)).size===4)data.template=buffer.toString('base64');
  return data;
}
function patchCell(xml,address,value){
  const expression=new RegExp('<c\\b([^>]*\\br="'+address+'"[^>]*?)\\s*(?:\\/>|>([\\s\\S]*?)<\\/c>)');
  const existing=xml.match(expression);
  const attrs=existing?existing[1].replace(/\s+t="[^"]*"/g,''):' r="'+address+'"';
  const body=value===undefined||value===null||value===''?'':typeof value==='number'?'<v>'+value+'</v>':'<is><t xml:space="preserve">'+escape(value)+'</t></is>';
  const cell='<c'+attrs+(typeof value==='string'&&value!==''?' t="inlineStr"':'')+'>'+body+'</c>';
  if(existing)return xml.replace(expression,cell);
  if(body==='')return xml;
  const position=XLSX.utils.decode_cell(address),rowExpression=new RegExp('<row\\b([^>]*\\br="'+(position.r+1)+'"[^>]*?)>([\\s\\S]*?)<\\/row>');
  const row=xml.match(rowExpression);if(!row)throw fail('Baris '+(position.r+1)+' tidak tersedia dalam template Excel.',409);
  const next=[...row[2].matchAll(/<c\b[^>]*\br="([A-Z]+\d+)"/g)].find(match=>XLSX.utils.decode_cell(match[1]).c>position.c),index=next?.index??row[2].length;
  return xml.replace(rowExpression,'<row'+row[1]+'>'+row[2].slice(0,index)+cell+row[2].slice(index)+'</row>');
}
function write(data){
  const buffer=data.ikasWorkbookTemplate?Buffer.from(data.ikasWorkbookTemplate,'base64'):fs.readFileSync(path.join(__dirname,'../../data/ikas-template.xlsx'));
  const book=XLSX.read(buffer,{type:'buffer'}),template=parse(book),paths=sheetPaths(buffer),xml=new Map(zip.entries(buffer).rows.map(row=>[row.name,row.content.toString('utf8')])),changes=new Map();
  const assessment=scoring.normalize(data.assessment),current=new Map(data.controls.ikas.map(row=>[row.id,row]));
  const ids=new Set(template.controls.map(row=>row.id));
  if(data.controls.ikas.some(row=>!ids.has(row.id)))throw fail('Template Excel belum memuat seluruh pertanyaan. Import workbook lengkap versi terbaru terlebih dahulu.',409);
  for(const source of template.controls){
    const row=current.get(source.id),file=paths.get(source.ikas.sourceSheet);let content=changes.get(file)??xml.get(file);
    if(!file||!content)throw fail('Worksheet template tidak tersedia.',409);
    const score=!row||row.applicability==='Not applicable'?'Not Applicable':assessment.scores[source.id];
    content=patchCell(content,XLSX.utils.encode_cell({r:source.ikas.sourceRow-1,c:source.ikas.scoreColumn}),score);
    content=patchCell(content,XLSX.utils.encode_cell({r:source.ikas.sourceRow-1,c:source.ikas.notesColumn}),row?assessment.notes[source.id]||'':'');changes.set(file,content);
  }
  return zip.patch(buffer,changes);
}
module.exports={read,write,parse,patchCell,sheetPaths};
