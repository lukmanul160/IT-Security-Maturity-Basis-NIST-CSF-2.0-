const test=require('node:test'),assert=require('node:assert/strict'),XLSX=require('xlsx');
const employees=require('../src/services/statementEmployeeService');
function workbook(rows){const book=XLSX.read(employees.workbook(),{type:'buffer'});book.Sheets.Karyawan=XLSX.utils.aoa_to_sheet([['NIP','Nama','Departemen','Jabatan','Status','Penyedia'],...rows]);return XLSX.write(book,{type:'buffer',bookType:'xlsx'});}
test('employee workbook preserves text NIPs, provides a separate example, and validates imports before persistence',()=>{
 const example=XLSX.read(employees.workbook(),{type:'buffer',cellNF:true});assert.deepEqual(example.SheetNames,['Karyawan','Contoh','Petunjuk']);assert.equal(example.Sheets.Contoh.A2.v,'001234');assert.equal(example.Sheets.Karyawan.A2.z,'@');
 const rows=employees.parse(workbook([['000333','A','TI','Staf','Tetap','']]));assert.equal(rows[0].nip,'000333');assert.equal(rows[0].department,'TI');assert.equal(rows[0].email,undefined);
 for(const rows of [[[333,'A']], [['333','A'],['333','B']], [['333','']], [['333','A','','','Invalid']]])assert.throws(()=>employees.parse(workbook(rows)),{status:400});
 const book=XLSX.read(workbook([['333','A']]),{type:'buffer'});book.Sheets.Karyawan.B2={t:'s',v:'A',f:'CONCAT("A","B")'};assert.throws(()=>employees.parse(XLSX.write(book,{type:'buffer',bookType:'xlsx'})),{status:400});
 assert.throws(()=>employees.parse(Buffer.from('not excel')),{status:400});assert.throws(()=>employees.validateRows(Array.from({length:501},(_,i)=>({nip:String(i),name:'A'}))),{status:400});
});
test('assignment and export years are bounded and export SQL cannot be supplied by callers',()=>{
 const exports=require('../src/services/statementExportService');assert.equal(employees.year('2026'),2026);for(const value of ['hello',1999,2101,2026.5])assert.throws(()=>employees.year(value),{status:400});
 assert.equal(exports.filter({year:2026,basis:'assignment'}).basis,'assignment');assert.throws(()=>exports.filter({year:2026,basis:'input OR true'}),{status:400});
});

test('new employee template imports optional email and rejects invalid addresses',()=>{
 const book=XLSX.read(employees.workbook(),{type:'buffer'});assert.equal(book.Sheets.Karyawan.G1.v,'Email');XLSX.utils.sheet_add_aoa(book.Sheets.Karyawan,[['0001','Pegawai','IT','Staf','Tetap','','pegawai@example.com']],{origin:'A2'});const rows=employees.parse(XLSX.write(book,{type:'buffer',bookType:'xlsx'}));assert.equal(rows[0].email,'pegawai@example.com');
 assert.throws(()=>employees.employee({nip:'1',name:'A',email:'invalid'}),{status:400});assert.equal(employees.employee({nip:'1',name:'A'}).email,'');
});
