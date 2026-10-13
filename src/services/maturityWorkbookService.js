const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const zip = require('./ikasTemplateZip');
const { patchCell, sheetPaths } = require('./ikasWorkbookService');
const fail = message => Object.assign(Error(message), { status: 400 });
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const config = {
  csf: { sheet:'CSF 2.0', summary:'NIST CSF Summary', fn:0, category:1, control:2, policy:6, policyNote:7, practice:8, practiceNote:9, header:2, sample:5, target:3, summaryPolicy:4, summaryPractice:5 },
  privacy: { sheet:'Privacy Framework Core', summary:'Privacy Summary', fn:1, category:3, control:5, policy:11, policyNote:12, practice:13, practiceNote:14, header:2, sample:4, target:2, summaryPolicy:3, summaryPractice:4 }
};
const canonical = (framework, code) => framework === 'csf' ? code.replaceAll('.', '-') : code;
const codeOf = text => String(text || '').match(/^([^:\s]+)\s*:/)?.[1];
const subcategoryText=(framework,item)=>canonical(framework,codeOf(item.subcategory)||'')===item.id?item.subcategory:item.id+': '+String(item.subcategory||'');
const categoryKey = text => String(text || '').match(/\(([^)]+)\)/)?.[1] || String(text || '').split(':')[0].trim();
const cell = (column, row) => XLSX.utils.encode_cell({ c:column, r:row-1 });
function score(value, label) {
  if(value === '' || value === undefined || value === null) return undefined;
  if(typeof value === 'boolean' || !/^\d(?:\.\d+)?$/.test(String(value).trim()) || !Number.isFinite(Number(value)) || Number(value)<0 || Number(value)>5) throw fail(label+' harus angka 0–5 atau kosong.');
  return Number(value);
}
function parse(book, framework) {
  const c=config[framework]; if(!c) throw fail('Framework Excel tidak tersedia.');
  const sheet=book.Sheets[c.sheet]; if(!sheet) throw fail('Sheet '+c.sheet+' wajib tersedia.');
  const text=(column,row)=>String(sheet[cell(column,row)]?.v ?? '');
  for(const [column,expected] of [[c.policy,/policy\s*(maturity|score)/i],[c.policyNote,/policy\s*score\s*reasoning/i],[c.practice,/practice\s*(maturity|score)/i],[c.practiceNote,/practice\s*score\s*reasoning/i]]) if(!expected.test(text(column,c.header).replace(/\s+/g,' '))) throw fail('Header maturity/reasoning tidak sesuai template pada '+cell(column,c.header)+'.');
  const end=XLSX.utils.decode_range(sheet['!ref'] || 'A1').e.r+1;
  if(end>50000) throw fail('Excel terlalu banyak baris.');
  const controls=[], policyScores={}, practiceScores={}, notes={}, seen=new Set(); let fn='',category='';
  for(let row=framework==='csf'?3:4;row<=end;row++) {
    if(text(c.fn,row).trim()) fn=text(c.fn,row).trim();
    if(text(c.category,row).trim()) category=text(c.category,row).trim();
    const subcategory=text(c.control,row).trim(); if(!subcategory) continue;
    const raw=codeOf(subcategory); if(!raw) throw fail('Kode kontrol di awal subcategory wajib diikuti titik dua pada baris '+row+'.');
    const id=canonical(framework,raw); if(id.length>200 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw fail('Kode kontrol tidak valid pada baris '+row+'.');
    if(seen.has(id)) throw fail('Kode kontrol duplikat: '+id); seen.add(id);
    if(!fn || !category) throw fail('Function dan category wajib tersedia untuk '+id+'.');
    const values={}; for(const [key,column] of [['policy',c.policy],['practice',c.practice]]) {
      if(sheet[cell(column,row)]?.f) throw fail('Nilai maturity harus angka, bukan formula, pada '+cell(column,row)+'.');
      values[key]=score(sheet[cell(column,row)]?.v, id+' '+key);
    }
    if(values.policy!==undefined) policyScores[id]=values.policy;
    if(values.practice!==undefined) practiceScores[id]=values.practice;
    notes['policy-'+id]=text(c.policyNote,row); notes['practice-'+id]=text(c.practiceNote,row);
    controls.push({id,function:fn,category,subcategory,...(framework==='csf'?{implementation:text(3,row),references:text(5,row)||text(4,row)}:{}),sourceRow:row});
    if(controls.length>5000) throw fail('Maksimal 5.000 kontrol per import.');
  }
  if(!controls.length) throw fail('Tidak ada kontrol dalam sheet '+c.sheet+'.');
  return {controls,policyScores,practiceScores,notes};
}
function read(buffer, framework) {
  try { zip.entries(buffer); return parse(XLSX.read(buffer,{type:'buffer',cellFormula:true}),framework); }
  catch(error) { if(error.status) throw error; throw fail('File Excel tidak valid: '+error.message); }
}
function styledRow(xml, sample, row, columns) {
  const original=xml.match(new RegExp('<row\\b[^>]*\\br="'+sample+'"[^>]*>[\\s\\S]*?</row>'))?.[0];
  if(!original) throw fail('Baris contoh template tidak tersedia.');
  const attrs=original.match(/^<row([^>]*)>/)[1].replace(/\br="\d+"/, 'r="'+row+'"');
  const styles=new Map([...original.matchAll(/<c\b([^>]*)(?:\/>|>[\s\S]*?<\/c>)/g)].map(m=>[m[1].match(/\br="([A-Z]+)\d+"/)?.[1], m[1].match(/\bs="(\d+)"/)?.[1]]));
  return '<row'+attrs+'>'+Array.from({length:columns},(_,column)=>{const address=cell(column,row),style=styles.get(address.replace(/\d+/,''));return '<c r="'+address+'"'+(style?' s="'+style+'"':'')+'/>';}).join('')+'</row>';
}
function insertRow(xml, row, content) {
  const existing=new RegExp('<row\\b[^>]*\\br="'+row+'"[^>]*(?:\\/>|>[\\s\\S]*?</row>)');
  if(existing.test(xml)) return xml.replace(existing,content);
  const next=[...xml.matchAll(/<row\b[^>]*\br="(\d+)"/g)].find(m=>Number(m[1])>row);
  return next?xml.slice(0,next.index)+content+xml.slice(next.index):xml.replace('</sheetData>',content+'</sheetData>');
}
function formula(xml,address,expression,value) {
  xml=patchCell(xml,address,value);
  return xml.replace(new RegExp('(<c\\b[^>]*\\br="'+address+'"[^>]*>)([\\s\\S]*?)(</c>)'),(_,a,b,c)=>a+'<f>'+escape(expression)+'</f>'+b+c);
}
function write(snapshots, year=2026) {
  const buffer=fs.readFileSync(path.join(__dirname,'../../data/maturity-template.xlsx'));
  const book=XLSX.read(buffer,{type:'buffer'}), paths=sheetPaths(buffer), parts=new Map(zip.entries(buffer).rows.map(r=>[r.name,r.content.toString('utf8')])), changes=new Map(), chartValues=new Map();
  for(const [framework,c] of Object.entries(config)) {
    const template=parse(book,framework), data=snapshots[framework], controls=data?.controls?.[framework] || [], state=data?.assessment || {}, byId=new Map(controls.map(r=>[r.id,r])), emitted=new Set(), positions=[];
    let xml=parts.get(paths.get(c.sheet)), last=Math.max(framework==='csf'?142:0,...template.controls.map(r=>r.sourceRow));
    for(const source of template.controls) {
      const item=byId.get(source.id); if(item) { emitted.add(item.id); positions.push({...item,row:source.sourceRow}); }
      for(const [column,key] of [[c.policy,'policyScores'],[c.practice,'practiceScores']]) {
        const value=item?score(state[key]?.[item.id] ?? (key==='practiceScores'?state.scores?.[item.id]:undefined),item.id):undefined;
        xml=patchCell(xml,cell(column,source.sourceRow),value);
      }
      for(const [column,prefix] of [[c.policyNote,'policy-'],[c.practiceNote,'practice-']]) xml=patchCell(xml,cell(column,source.sourceRow),item?state.notes?.[prefix+item.id] || '':'');
      if(item) {
        xml=patchCell(xml,cell(c.control,source.sourceRow),subcategoryText(framework,item));
        if(framework==='csf') {xml=patchCell(xml,cell(3,source.sourceRow),item.implementation||'');xml=patchCell(xml,cell(5,source.sourceRow),item.references||'');}
      }
    }
    // New controls use the same styled columns; existing template rows and drawings stay intact.
    for(const item of controls.filter(r=>!emitted.has(r.id))) {
      const row=++last; xml=insertRow(xml,row,styledRow(xml,c.sample,row,c.practiceNote+1));
      for(const [column,value] of [[c.fn,item.function],[c.category,item.category],[c.control,subcategoryText(framework,item)],[c.policy,state.policyScores?.[item.id]],[c.policyNote,state.notes?.['policy-'+item.id]||''],[c.practice,state.practiceScores?.[item.id]??state.scores?.[item.id]],[c.practiceNote,state.notes?.['practice-'+item.id]||'']]) xml=patchCell(xml,cell(column,row),value);
      if(framework==='csf') {xml=patchCell(xml,cell(3,row),item.implementation||'');xml=patchCell(xml,cell(5,row),item.references||'');}
      positions.push({...item,row});
    }
    if(last>XLSX.utils.decode_range(book.Sheets[c.sheet]['!ref']).e.r+1) xml=xml.replace(/(<dimension\b[^>]*ref="[A-Z]+\d+:[A-Z]+)\d+("\/?>)/,'$1'+last+'$2');
    if(framework==='csf') xml=xml.replace(/(<autoFilter\b[^>]*ref="A2:E)\d+"/,'$1'+Math.max(last,142)+'"');
    changes.set(paths.get(c.sheet),xml);
    // Summary formulas include added controls and categories, while retaining the template layout.
    const summary=book.Sheets[c.summary], categories=new Map();
    for(const item of positions) {const key=categoryKey(item.category);if(!categories.has(key))categories.set(key,[]);categories.get(key).push(item);}
    let sx=parts.get(paths.get(c.summary)), summaryEnd=3, processed=new Set(); const values=new Map([['B3',summary.B3.v]]);
    const summaryRows=Object.keys(summary).filter(a=>/^B\d+$/.test(a)&&Number(a.slice(1))>=4).map(a=>Number(a.slice(1))).sort((a,b)=>a-b);
    function writeSummary(row,label,items) {
      values.set('B'+row,label.split(':')[0]);
      const target=(data?.targets?.[framework]||[]).find(t=>categoryKey(t.category)===categoryKey(label))?.targetScore??3;
      sx=patchCell(sx,cell(c.target,row),target); values.set(cell(c.target,row),target);
      for(const [out,input,key] of [[c.summaryPolicy,c.policy,'policyScores'],[c.summaryPractice,c.practice,'practiceScores']]) {
        const refs=items.map(item=>"'"+c.sheet+"'!"+cell(input,item.row)), average=items.length?items.reduce((sum,item)=>sum+(state[key]?.[item.id]??(key==='practiceScores'?state.scores?.[item.id]:0)??0),0)/items.length:0;
        sx=formula(sx,cell(out,row),refs.length?'SUM('+refs.join(',')+')/'+items.length:'0',average);values.set(cell(out,row),average);
      }
      if(framework==='csf') sx=patchCell(sx,'C'+row,'('+items.length+')');
      summaryEnd=Math.max(summaryEnd,row);
    }
    for(const row of summaryRows) {
      const label=summary['B'+row]?.v || '',key=categoryKey(label);processed.add(key);writeSummary(row,label,categories.get(key)||[]);
    }
    for(const [key,items] of categories) if(!processed.has(key)) {
      const row=++summaryEnd;sx=insertRow(sx,row,styledRow(sx,4,row,c.summaryPractice+1));sx=patchCell(sx,'A'+row,items[0].function.split(':')[0]);sx=patchCell(sx,'B'+row,items[0].category.split(':')[0]);writeSummary(row,items[0].category,items);
    }
    for(const column of [c.target,c.summaryPolicy,c.summaryPractice]) {
      const letter=XLSX.utils.encode_col(column),average=Array.from({length:summaryEnd-3},(_,i)=>values.get(letter+(i+4))||0).reduce((a,b)=>a+b,0)/(summaryEnd-3);
      sx=formula(sx,letter+'3','SUM('+letter+'4:'+letter+summaryEnd+')/COUNT('+letter+'4:'+letter+summaryEnd+')',average);values.set(letter+'3',average);
    }
    sx=patchCell(sx,framework==='csf'?'E1':'D1',year);
    sx=sx.replace(/(<dimension\b[^>]*ref="[A-Z]+\d+:[A-Z]+)\d+("\/?>)/,'$1'+summaryEnd+'$2');
    changes.set(paths.get(c.summary),sx);chartValues.set(c.summary,{values,end:summaryEnd});
  }
  for(const [name,content] of parts) if(/^xl\/charts\/chart\d+\.xml$/.test(name)) {
    let changed=content.replace(/<c:numRef>([\s\S]*?)<\/c:numRef>/g,(all,body)=>{
      const match=body.match(/<c:f>'?([^'!]+)'?!\$?([A-Z]+)\$?(\d+):\$?([A-Z]+)\$?(\d+)<\/c:f>/); const cache=match&&chartValues.get(match[1]);if(!cache)return all;
      const column=match[2],start=Number(match[3]),end=cache.end,points=Array.from({length:end-start+1},(_,i)=>'<c:pt idx="'+i+'"><c:v>'+(cache.values.get(column+(start+i))??0)+'</c:v></c:pt>').join('');
      return '<c:numRef>'+body.replace(match[0],'<c:f>\''+escape(match[1])+'\'!$'+column+'$'+start+':$'+column+'$'+end+'</c:f>').replace(/<c:numCache>[\s\S]*?<\/c:numCache>/,'<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="'+(end-start+1)+'"/>'+points+'</c:numCache>')+'</c:numRef>';
    });
    changed=changed.replace(/<c:strRef>([\s\S]*?)<\/c:strRef>/g,(all,body)=>{
      const match=body.match(/<c:f>'?([^'!]+)'?!\$?B\$?(\d+):\$?B\$?(\d+)<\/c:f>/),cache=match&&chartValues.get(match[1]);if(!cache)return all;
      const start=Number(match[2]),end=cache.end,points=Array.from({length:end-start+1},(_,i)=>'<c:pt idx="'+i+'"><c:v>'+escape(cache.values.get('B'+(start+i))||'')+'</c:v></c:pt>').join('');
      return '<c:strRef>'+body.replace(match[0],'<c:f>\''+escape(match[1])+'\'!$B$'+start+':$B$'+end+'</c:f>').replace(/<c:strCache>[\s\S]*?<\/c:strCache>/,'<c:strCache><c:ptCount val="'+(end-start+1)+'"/>'+points+'</c:strCache>')+'</c:strRef>';
    });if(changed!==content)changes.set(name,changed);
  }
  changes.set('xl/workbook.xml',parts.get('xl/workbook.xml').replace(/<calcPr\b[^>]*\/>/,'<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>'));
  return zip.patch(buffer,changes);
}
module.exports={config,read,parse,write,canonical,categoryKey};
