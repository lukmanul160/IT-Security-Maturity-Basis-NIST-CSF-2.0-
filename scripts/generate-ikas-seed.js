const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const root = path.join(__dirname, '..');
function extract(workbook) {
  const domains = [ ['I Identifikasi','IDENTIFIKASI',.25], ['II Proteksi','PROTEKSI',.30], ['III Deteksi','DETEKSI',.25], ['IV Gulih','PENANGGULANGAN DAN PEMULIHAN',.20] ];
  const controls = [];
  for (const [sheet,domain,weight] of domains) {
    let category, subcategory, subcategoryId;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {header:1,range:0,defval:''});
    rows.forEach((row,index) => {
      const label=String(row[0]).trim();
      if (/^Kategori\s/.test(label)) category=`${label.match(/\d+\.\d+/)[0]}: ${String(row[1]).trim()}`;
      else if (/^Sub Kategori\s/.test(label)) {subcategoryId=label.match(/\d+\.\d+\.\d+/)[0];subcategory=String(row[1]).trim();}
      else if (/^[a-z]$/.test(label) && row[1]) {
        if (!category || !subcategoryId) throw Error('Struktur IKAS tidak valid: '+sheet+' baris '+(index+1));
        const rubric=Array.from({length:6},(_,score)=>String(row[4+score]||'').trim());
        if(rubric.some(value=>!value))throw Error('Rubrik tidak lengkap: '+sheet+' baris '+(index+1));
        controls.push({id:`IKAS-${subcategoryId}-${label}`,function:domain,category,subcategory:String(row[1]).trim(),
          implementation:rubric.map((text,score)=>`Indeks ${score}:\n${text}`).join('\n\n'),
          references:`IKAS BSSN v1.2.1 / ${sheet} / baris ${index+1} / Sub Kategori ${subcategoryId}: ${subcategory}`,
          minimumEvidence:'',notes:'',evidence:[],applicability:'Applicable',
          ikas:{subcategoryId,subcategory,scope:String(row[2]).trim(),rubric,sourceSheet:sheet,sourceRow:index+1,weight}});
      }
    });
  }
  if(new Set(controls.map(row=>row.id)).size!==controls.length)throw Error('ID IKAS duplikat');
  const respondent=XLSX.utils.sheet_to_json(workbook.Sheets.Responden,{header:1,range:'A1:H18',defval:''});
  const fields=respondent.map((row,index)=>({label:String(row[1]||'').trim(),cell:`D${index+1}`})).filter(row=>row.label && row.cell!=='D1' && row.cell!=='D2');
  return {version:'1.2.1',source:'IKAS v.1.2.1.xlsx',domains:domains.map(([sheet,name,weight])=>({sheet,name,weight})),respondentFields:fields,controls};
}
if(require.main===module){
  const seed=extract(XLSX.readFile(process.argv[2]||path.join(root,'IKAS v.1.2.1.xlsx')));
  fs.writeFileSync(path.join(root,'data/ikas-data.json'),JSON.stringify(seed,null,2)+'\n');
  console.log(`${seed.controls.length} pertanyaan, ${new Set(seed.controls.map(row=>row.category)).size} kategori, ${new Set(seed.controls.map(row=>row.ikas.subcategoryId)).size} subkategori IKAS.`);
}
module.exports={extract};
