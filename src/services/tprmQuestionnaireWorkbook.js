const XLSX = require('xlsx');
const crypto = require('node:crypto');
const zip = require('./ikasTemplateZip');
const rules = require('../shared/tprmWorkflow');
const { text, invalid } = rules;
const headers = ['ID Pertanyaan', 'Bagian', 'Pertanyaan', 'Jawaban (Yes/No/N/A)', 'Keterangan / rincian', 'Referensi bukti (nama file)'];
const format = 'TPRM-QUESTIONNAIRE-1';
function questions(sections) {
  if (!Array.isArray(sections) || !sections.length) throw invalid('Template kuesioner tidak memiliki pertanyaan.');
  const result = [];
  for (const section of sections) {
    if (!Array.isArray(section) || !text(section[0]) || !Array.isArray(section[1]) || !section[1].length) throw invalid('Struktur template kuesioner tidak valid.');
    section[1].forEach((question, index) => {
      if (!text(question)) throw invalid('Pertanyaan template tidak boleh kosong.');
      result.push({ id: `Q${String(result.length + 1).padStart(4, '0')}`, section: section[0], question, key: `${section[0]}-${index}` });
    });
  }
  if (result.length > 2000) throw invalid('Maksimum 2000 pertanyaan per workbook.');
  if (new Set(result.map(row=>row.key)).size!==result.length) throw invalid('Judul bagian template harus unik agar setiap jawaban dapat dicocokkan.');
  return result;
}
function schemaHash(sections) { return crypto.createHash('sha256').update(rules.stableJson(sections)).digest('hex'); }
function answerFingerprint(record, fallbackSections) {
  const responses=record.responses || {},sections=responses.questionnaireSections || fallbackSections;
  const answers=questions(sections).map(row=>[row.key,text(responses[`${row.key}-decision`]),text(responses[row.key]),text(responses[`${row.key}-evidenceReference`])]);
  return crypto.createHash('sha256').update(rules.stableJson({templateId:responses.templateId,answers,respondent:responses.offlineRespondent || {}})).digest('hex');
}
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Calibri"/><color rgb="FF182338"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF182338"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF5D6"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFDCE5F2"/></left><right style="thin"><color rgb="FFDCE5F2"/></right><top style="thin"><color rgb="FFDCE5F2"/></top><bottom style="thin"><color rgb="FFDCE5F2"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/><protection locked="1"/></xf><xf numFmtId="49" applyNumberFormat="1" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyAlignment="1" applyProtection="1"><alignment vertical="top" wrapText="1"/><protection locked="0"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
function decorate(buffer, count, bound) {
  const changes = new Map([['xl/styles.xml', styles]]);
  for (const entry of zip.entries(buffer).rows) {
    const match = entry.name.match(/^xl\/worksheets\/sheet([123])\.xml$/);
    if (!match) continue;
    const number = Number(match[1]);
    let xml = entry.content.toString('utf8');
    xml = xml.replace(/<c\b([^>]*\br="([A-Z]+)(\d+)"[^>]*)>/g, (_, attributes, column, row) => {
      const editable = number === 3 ? Number(row) > 1 && ['D', 'E', 'F'].includes(column) : number === 2 && column === 'B' && ((Number(row) === 2 && !bound) || (Number(row) >= 3 && Number(row) <= 6));
      const style = Number(row) === 1 ? 1 : editable ? 3 : 2;
      return `<c${attributes.replace(/\s+s="\d+"/, '')} s="${style}">`;
    });
    if (number === 2 || number === 3) xml = xml.replace('</sheetData>', '</sheetData><sheetProtection sheet="1" objects="1" scenarios="1" formatRows="0" formatColumns="0" autoFilter="0" selectLockedCells="0" selectUnlockedCells="0"/>');
    if (number === 3) {
      xml = xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>');
      const validation = `<dataValidations count="1"><dataValidation type="list" errorStyle="stop" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Jawaban tidak valid" error="Pilih Yes, No, atau N/A" promptTitle="Isi jawaban vendor" prompt="Pilih Yes, No, atau N/A; jelaskan pada kolom keterangan." sqref="D2:D${count + 1}"><formula1>"Yes,No,N/A"</formula1></dataValidation></dataValidations>`;
      xml = xml.includes('<ignoredErrors') ? xml.replace('<ignoredErrors', `${validation}<ignoredErrors`) : xml.replace('</worksheet>', `${validation}</worksheet>`);
    }
    changes.set(entry.name, xml);
  }
  return zip.patch(buffer, changes);
}
function write({ record = null, template, blank = false }) {
  const rows = questions(template.sections), responses = blank ? {} : record?.responses || {};
  const respondent = responses.offlineRespondent || {};
  const meta = { format, questionnaireId: record ? String(record.id) : '', vendorName: record?.vendorName || '', templateId: String(template.id), templateName: template.template_name, schemaHash: schemaHash(template.sections), revision: record ? Number(record.responses?.revision || 0) : null,answersHash:record ? answerFingerprint(record,template.sections) : '' };
  const book = XLSX.utils.book_new();
  book.Props = { Title: 'TPRM Vendor Due Diligence Questionnaire', Subject: template.template_name, Author: 'TPRM' };
  const guide = XLSX.utils.aoa_to_sheet([
    ['KUESIONER VENDOR OFFLINE', ''],
    ['Template', template.template_name],
    ['1. Identitas', 'Isi informasi responden pada sheet Vendor. Vendor tidak perlu login ke aplikasi.'],
    ['2. Jawaban', 'Pada sheet Kuesioner, isi kolom kuning: Yes / No / N/A, keterangan, dan referensi bukti.'],
    ['3. Keterangan', 'Jelaskan setiap jawaban. Untuk N/A, tulis alasan tidak berlaku.'],
    ['4. Dokumen bukti', 'Tulis nama file atau referensi dokumen. Kirim file bukti terpisah bersama Excel kepada tim internal. Excel tidak mengunggah dokumen otomatis.'],
    ['5. Struktur', 'Jangan mengubah ID, bagian, pertanyaan, nama sheet, atau sheet tersembunyi. Baris boleh diurutkan; semua baris harus tetap tersedia.'],
    ['6. Kirim kembali', 'Simpan sebagai .xlsx dan kirim kepada tim internal untuk import dan review.'],
    ['7. Import', 'Baris dengan jawaban, keterangan, dan referensi bukti yang seluruhnya kosong tidak mengganti jawaban tersimpan.'],
    ['8. Keputusan', 'Skor internal, review, approval, dan file bukti tetap dikelola tim internal di sistem. Import tidak otomatis menyetujui vendor.']
  ]);
  guide['!cols'] = [{ wch: 26 }, { wch: 105 }]; guide['!rows'] = Array.from({length:10},(_,index)=>({hpt:index===0?32:48})); guide['!merges']=[{s:{r:0,c:0},e:{r:0,c:1}}];
  XLSX.utils.book_append_sheet(book, guide, 'Panduan');
  const info = XLSX.utils.aoa_to_sheet([
    ['INFORMASI VENDOR', ''], ['Nama vendor', record?.vendorName || ''], ['Nama responden', respondent.name || ''], ['Jabatan responden', respondent.position || ''], ['Email / kontak', respondent.contact || ''], ['Tanggal pengisian (YYYY-MM-DD)', respondent.date || ''], ['Template', template.template_name]
  ]);
  info['!cols']=[{wch:38},{wch:80}];info['!rows']=Array.from({length:7},()=>({hpt:30}));info['!merges']=[{s:{r:0,c:0},e:{r:0,c:1}}];
  XLSX.utils.book_append_sheet(book, info, 'Vendor');
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows.map(row => [row.id, row.section, row.question, responses[`${row.key}-decision`] || '', responses[row.key] || '', responses[`${row.key}-evidenceReference`] || ''])]);
  sheet['!cols']=[{wch:17},{wch:34},{wch:85},{wch:23},{wch:85},{wch:48}];sheet['!rows']=[{hpt:34},...rows.map(()=>({hpt:90}))];sheet['!autofilter']={ref:`A1:F${rows.length+1}`};
  XLSX.utils.book_append_sheet(book, sheet, 'Kuesioner');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['TPRM_METADATA', JSON.stringify(meta)]]), '_TPRM');
  book.Workbook={Sheets:book.SheetNames.map(name=>({name,Hidden:name==='_TPRM'?2:0}))};
  return decorate(XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true}),rows.length,Boolean(record));
}
function open(buffer) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length > 8 * 1024 * 1024) throw Error('File maksimum 8 MB.');
    const entries=zip.entries(buffer).rows;
    if(entries.some(entry=>/vbaProject|externalLinks/i.test(entry.name)))throw Error('Workbook macro atau external link tidak didukung.');
    const book=XLSX.read(buffer,{type:'buffer',cellFormula:true,cellDates:false});
    for(const name of ['Vendor','Kuesioner','_TPRM'])if(!book.Sheets[name])throw Error(`Sheet ${name} tidak ditemukan. Gunakan Excel hasil export sistem.`);
    const metaCell=book.Sheets._TPRM.B1;
    if(metaCell?.f)throw Error('Metadata Excel tidak valid.');
    const meta=JSON.parse(metaCell?.v || '{}');
    if(meta.format!==format || !/^\d+$/.test(meta.templateId) || !text(meta.schemaHash))throw Error('Format kuesioner Excel tidak dikenali.');
    const range=XLSX.utils.decode_range(book.Sheets.Kuesioner['!ref'] || 'A1');
    if(range.e.r>2000 || range.e.c>20)throw Error('Ukuran sheet kuesioner tidak valid.');
    return {book,meta};
  } catch(error) {throw invalid(`Excel tidak dapat dibaca: ${error.message}`);}
}
function cell(sheet, address) {
  const value=sheet[address];
  if(value?.f)throw invalid(`Formula tidak diperbolehkan pada sel ${address}. Isi nilai biasa.`);
  if(value?.t==='e')throw invalid(`Sel ${address} berisi error Excel.`);
  const result=text(value?.v);
  if(result.length>10000)throw invalid(`Isi sel ${address} terlalu panjang (maksimum 10000 karakter).`);
  return result;
}
function read(opened,{record,template}) {
  const {book,meta}=opened;
  if(meta.questionnaireId && String(meta.questionnaireId)!==String(record.id))throw invalid('Excel berasal dari assessment vendor lain. Pilih vendor yang sesuai.');
  if(meta.vendorName && meta.vendorName!==record.vendorName)throw invalid('Identitas vendor pada Excel tidak sesuai.');
  if(meta.schemaHash!==schemaHash(template.sections))throw invalid('Versi pertanyaan berbeda dari template saat ini. Export ulang Excel.',409);
  if(meta.questionnaireId && (meta.answersHash ? meta.answersHash!==answerFingerprint(record,template.sections) : Number(meta.revision)!==Number(record.responses?.revision || 0)))throw invalid('Jawaban assessment berubah setelah Excel diexport. Export ulang sebelum import.',409);
  const vendorSheet=book.Sheets.Vendor, vendorName=cell(vendorSheet,'B2');
  if(vendorName!==record.vendorName)throw invalid('Nama vendor pada sheet Vendor harus sesuai dengan assessment yang dipilih.');
  const respondent={name:cell(vendorSheet,'B3'),position:cell(vendorSheet,'B4'),contact:cell(vendorSheet,'B5'),date:cell(vendorSheet,'B6')};
  if(vendorSheet.B6?.t==='n'){
    const date=XLSX.SSF.parse_date_code(vendorSheet.B6.v,{date1904:book.Workbook?.WBProps?.date1904===true});
    respondent.date=date ? `${String(date.y).padStart(4,'0')}-${String(date.m).padStart(2,'0')}-${String(date.d).padStart(2,'0')}` : respondent.date;
  }
  if(respondent.date && !rules.validDate(respondent.date))throw invalid('Tanggal pengisian harus menggunakan YYYY-MM-DD yang valid.');
  const expected=questions(template.sections),byId=new Map(expected.map(row=>[row.id,row])),seen=new Set(),updates=[];
  const sheet=book.Sheets.Kuesioner;
  headers.forEach((header,index)=>{if(cell(sheet,`${String.fromCharCode(65+index)}1`)!==header)throw invalid('Header kuesioner berubah. Gunakan file hasil export.');});
  const range=XLSX.utils.decode_range(sheet['!ref']);
  for(let row=2;row<=range.e.r+1;row++){
    const values=['A','B','C','D','E','F'].map(column=>cell(sheet,`${column}${row}`));
    if(values.every(value=>!value))continue;
    const question=byId.get(values[0]);
    if(!question || seen.has(values[0]))throw invalid(`ID pertanyaan tidak dikenal atau duplikat pada baris ${row}.`);
    seen.add(values[0]);
    if(values[1]!==text(question.section)||values[2]!==text(question.question))throw invalid(`Bagian atau pertanyaan pada baris ${row} berubah. Export ulang Excel.`);
    const [,, ,answer,notes,evidenceReference]=values;
    if(!answer&&!notes&&!evidenceReference)continue;
    const decision=({yes:'Yes',ya:'Yes',no:'No',tidak:'No','n/a':'N/A',na:'N/A','tidak berlaku':'N/A'})[answer.toLowerCase()] || '';
    if(answer&&!decision)throw invalid(`Jawaban pada baris ${row} harus Yes, No, atau N/A.`);
    updates.push({id:question.id,key:question.key,section:question.section,decision,notes,evidenceReference});
  }
  if(seen.size!==expected.length)throw invalid('Ada baris pertanyaan yang hilang. Semua pertanyaan harus tetap ada di Excel.');
  const offlineRespondent={...(record.responses?.offlineRespondent || {}),...Object.fromEntries(Object.entries(respondent).filter(([,value])=>value))};
  const responses={...(record.responses || {}),templateId:template.id,questionnaireSections:template.sections,offlineRespondent};
  for(const update of updates){responses[`${update.key}-decision`]=update.decision;responses[update.key]=update.notes;responses[`${update.key}-evidenceReference`]=update.evidenceReference;}
  const respondentUpdated=Object.entries(respondent).filter(([key,value])=>value&&value!==record.responses?.offlineRespondent?.[key]).length;
  return {responses,preview:{vendorName:record.vendorName,templateName:template.template_name,total:expected.length,updated:updates.length,respondentUpdated,completeAnswers:updates.filter(row=>row.decision&&row.notes).length,skipped:expected.length-updates.length,expectedRevision:Number(record.responses?.revision || 0),respondent:offlineRespondent,sections:[...new Set(expected.map(row=>row.section))].map(section=>({name:section,total:expected.filter(row=>row.section===section).length,updated:updates.filter(row=>row.section===section).length}))}};
}
module.exports={questions,schemaHash,write,open,read};
