const { calendarDate }=require('./complianceService');
const fail=message=>Object.assign(new Error(message),{status:400});
const reserved=new Set(['signature','consent','revision','tanda_tangan','__proto__','constructor','prototype','id','title','name','elements','length','reset','requestsubmit','submit','action','method','target','enctype','encoding','acceptcharset','autocomplete','checkvalidity','reportvalidity']);
const defaults=[
 {key:'status',label:'Status pekerja',type:'select',required:true,options:['Tetap','Kontrak','Outsource']},
 {key:'nama',label:'Nama lengkap',type:'text',required:true},
 {key:'nip',label:'NIP',type:'text',required:true},
 {key:'jabatan',label:'Jabatan',type:'text',required:true},
 {key:'penyedia',label:'Penyedia jasa tenaga kerja',type:'text',required:false},
 {key:'tempat',label:'Tempat penandatanganan',type:'text',required:true},
 {key:'tanggal',label:'Tanggal penandatanganan',type:'date',required:true}
];
function normalize(input=defaults){
 if(!Array.isArray(input)||input.length<2||input.length>30)throw fail('Gunakan 2 sampai 30 field isian.');
 const keys=new Set();
 const fields=input.map(f=>{
  if(!f||typeof f.key!=='string'||!/^[a-z][a-z0-9_]{0,39}$/.test(f.key)||reserved.has(f.key)||keys.has(f.key))throw fail('Kunci field harus unik, huruf kecil/angka/underscore, dan tidak memakai nama khusus sistem.');
  keys.add(f.key);
  if(typeof f.label!=='string'||!f.label.trim()||f.label.length>100)throw fail('Label field wajib diisi, maksimum 100 karakter.');
  if(!['text','textarea','date','select','email','number'].includes(f.type)||typeof f.required!=='boolean')throw fail('Jenis atau status wajib field tidak valid.');
  const result={key:f.key,label:f.label.trim(),type:f.type,required:f.required};
  if(f.public!==undefined&&typeof f.public!=='boolean')throw fail('Pilihan field publik tidak valid.');
  result.public=f.public!==false;
  if(f.value!==undefined&&(typeof f.value!=='string'||f.value.length>4000))throw fail('Nilai tetap field tidak valid.');
  result.value=f.value||'';
  if(!result.public&&result.required&&!result.value.trim())throw fail(`Isi nilai tetap untuk ${result.label} atau izinkan publik mengisinya.`);
  if(f.type==='select'){
   if(!Array.isArray(f.options)||!f.options.length||f.options.length>30||f.options.some(s=>typeof s!=='string'||!s.trim()||s.length>100))throw fail('Pilihan dropdown harus berisi 1 sampai 30 nilai.');
   result.options=[...new Set(f.options.map(s=>s.trim()))];
  }
  return result;
 });
 for(const key of ['nama','nip']){const f=fields.find(f=>f.key===key);if(!f||f.type!=='text'||!f.required||!f.public)throw fail('Field nama dan nip wajib ada, bersifat publik, bertipe teks, dan wajib diisi sebagai identitas pengisi.');}
 return fields;
}
function values(input,fields,{preview=false}={}){
 const data=Object.create(null);
 for(const f of normalize(fields)){
  const raw=f.public===false?f.value:input?.[f.key]??'';const max=f.type==='textarea'?4000:f.key==='nip'?80:500;
  if(typeof raw!=='string'||raw.length>max)throw fail(`${f.label} tidak valid (maksimum ${max} karakter).`);
  const value=raw.trim();
  if(!preview&&f.required&&!value)throw fail(`${f.label} wajib diisi.`);
  if(value){
   if(f.type==='date'&&!calendarDate(value))throw fail(`${f.label} harus berupa tanggal yang valid.`);
   if(f.type==='select'&&!f.options.includes(value))throw fail(`Pilihan ${f.label} tidak valid.`);
   if(f.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw fail(`${f.label} harus berupa email.`);
   if(f.type==='number'&&!/^-?\d+(\.\d+)?$/.test(value))throw fail(`${f.label} harus berupa angka.`);
   if(f.key==='nip'&&!/^[A-Za-z0-9._/-]+$/.test(value))throw fail('NIP tidak valid.');
  }
  if(value||!preview)data[f.key]=value;
 }
 if(!preview&&data.status==='Outsource'&&fields.some(f=>f.key==='penyedia')&&!data.penyedia)throw fail('Penyedia jasa tenaga kerja wajib diisi untuk Outsource.');
 return data;
}
module.exports={defaults,normalize,values};
