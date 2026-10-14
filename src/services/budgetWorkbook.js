const XLSX=require('xlsx');
const service=require('./budgetService');
const {pool}=require('../config/database');
const headers=['Judul','Bagian','Jenis','Nominal','Tujuan'];
function workbook(records=[],template=false){
  const book=XLSX.utils.book_new();
  const columns=template?headers:[...headers,'Tahun','Pengaju','Approver','Status','Realisasi'];
  const sheet=XLSX.utils.aoa_to_sheet([columns,...records.map(r=>[r.title,r.department,r.type,r.amount,r.purpose,...(template?[]:[r.year,r.requester,r.approver||'',r.status,r.actual])])]);
  sheet['!cols']=columns.map(()=>({wch:25}));XLSX.utils.book_append_sheet(book,sheet,'Anggaran');
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Petunjuk'],['Isi sheet Anggaran, satu pengajuan per baris. Maksimal 1000 baris.'],['Jenis: CAPEX atau OPEX. Nominal berupa angka IDR, maksimal dua desimal.'],['Impor menambahkan draft baru pada tahun yang dipilih, bukan memperbarui data.'],['Pengaju adalah akun yang mengimpor. Approver mengikuti pengaturan saat diajukan.'],['Kolom status, realisasi, pengaju dan approver pada ekspor tidak diimpor.']]),'Petunjuk');
  return XLSX.write(book,{type:'buffer',bookType:'xlsx'});
}
function parse(buffer){
  const fail=message=>{throw Object.assign(new Error(message),{status:400});};
  let book;try{require('./ikasTemplateZip').entries(buffer);book=XLSX.read(buffer,{type:'buffer',sheetRows:1002});}catch(e){fail('File Excel tidak valid. Gunakan template .xlsx.');}
  const sheet=book.Sheets.Anggaran;if(!sheet)fail('Sheet Anggaran tidak ditemukan.');
  if(sheet['!fullref']&&XLSX.utils.decode_range(sheet['!fullref']).e.r>1000)fail('Maksimal 1000 baris pengajuan.');
  for(const [key,cell] of Object.entries(sheet))if(!key.startsWith('!')&&cell?.f)fail('Rumus Excel tidak didukung. Gunakan nilai biasa.');
  const data=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
  if(!headers.every((h,i)=>data[0]?.[i]===h))fail('Kolom tidak sesuai template Anggaran.');
  const rows=data.slice(1).filter(row=>row.some(v=>v!==''));if(!rows.length||rows.length>1000)fail('Isi 1 sampai 1000 baris pengajuan.');
  return rows.map((row,i)=>{try{return service.fields({title:row[0],department:row[1],type:row[2],amount:row[3],purpose:row[4]});}catch(e){fail(`Baris ${i+2}: ${e.message}`);}});
}
async function importWorkbook(buffer,value,user){
  const year=service.year(value),rows=parse(buffer),client=await pool.connect();
  try{await client.query('BEGIN');if(!(await client.query('SELECT year FROM budget_years WHERE year=$1',[year])).rowCount)throw Object.assign(new Error('Buat tahun anggaran terlebih dahulu.'),{status:400});
    for(const row of rows){const record={...row,id:require('node:crypto').randomUUID(),year,status:'draft',actual:0,requesterId:user.username,requester:user.username,createdAt:new Date().toISOString(),history:[{at:new Date().toISOString(),actor:user.username,actorId:user.username,status:'draft',note:'Diimpor dari Excel'}]};await client.query('INSERT INTO budget_requests(id,year,data) VALUES($1,$2,$3)',[record.id,year,record]);}
    await client.query('COMMIT');return {count:rows.length};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}
module.exports={workbook,parse,importWorkbook};
