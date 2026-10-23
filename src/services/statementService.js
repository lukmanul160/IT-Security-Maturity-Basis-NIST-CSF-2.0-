const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../config/database');
const fieldService = require('./statementFields');
const documents = require('./statementDocumentService');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function field(input, key, max, required = true) {
  const value = input?.[key] ?? '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw fail(`Kolom ${key} wajib valid (maksimum ${max} karakter).`);
  return value.trim();
}
function normalizeType(input) {
  const title = field(input, 'title', 250), body = field(input, 'body', 60000, false);
  if (typeof input.active !== 'boolean') throw fail('Status publikasi tidak valid.');
  const fields = fieldService.normalize(input.fields);
  const allowed = [...fields.map(f=>f.key),'tanda_tangan'];
  for (const match of body.matchAll(/\{\{([^{}]+)\}\}/g)) if (!allowed.includes(match[1])) throw fail(`Placeholder ${match[0]} tidak dikenal.`);
  return { title, body, active: input.active, fields };
}
function normalizeSubmission(input, fields = fieldService.defaults) {
  const data = fieldService.values(input,fields);
  if (input.consent !== true) throw fail('Persetujuan surat wajib dicentang.');
  // Only accept bounded, decoded raster images; never retain uploaded file metadata.
  if (input.signatureImage !== undefined) {
    if (input.signature?.length) throw fail('Pilih satu metode tanda tangan.');
    const value=input.signatureImage;
    if(typeof value!=='string'||value.length>1500000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw fail('Gambar tanda tangan tidak valid.');
    try {
      const buffer=Buffer.from(value.split(',')[1],'base64');
      if(buffer.length<24||!buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')))throw Error();
      const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);
      if(width<2||height<2||width>1600||height>800)throw Error();
      const {PNG}=require('pngjs'),image=PNG.sync.read(buffer,{checkCRC:true});
      let ink=0;for(let i=0;i<image.data.length;i+=4)if(image.data[i+3]>30&&Math.min(...image.data.subarray(i,i+3))<230)ink++;
      if(ink<15||ink>width*height*.95)throw Error();
      return {...data,signatureImage:'data:image/png;base64,'+PNG.sync.write(image).toString('base64'),consent:true};
    }catch{throw fail('Gambar tanda tangan tidak valid.');}
  }
  if (!Array.isArray(input.signature) || input.signature.length < 1 || input.signature.length > 150) throw fail('Tanda tangan wajib diisi.');
  let count = 0;
  const signature = input.signature.map(stroke => {
    if (!Array.isArray(stroke) || stroke.length < 2 || stroke.length > 2000) throw fail('Tanda tangan tidak valid.');
    return stroke.map(point => {
      count++;
      if (!Array.isArray(point) || point.length !== 2 || point.some(n => !Number.isFinite(n) || n < 0 || n > 1)) throw fail('Tanda tangan tidak valid.');
      return point;
    });
  });
  if (count > 12000 || !signature.some(stroke => stroke.some(p => Math.hypot(p[0]-stroke[0][0],p[1]-stroke[0][1]) > 0.025))) throw fail('Gambar tanda tangan yang jelas.');
  return { ...data, signature, consent: true };
}
function render(body, data) { return body.replace(/\{\{([a-z][a-z0-9_]{0,39})\}\}/g, (_, key) => data[key] || '-'); }
async function ensureStore() {
  await pool.query(await fs.readFile(path.join(__dirname,'../../database/statements.sql'),'utf8'));
  const seeds = require('../../templates/statement-seeds.json');
  // Stable IDs make initialization idempotent even after templates are edited.
  for (const [index,seed] of seeds.entries()) await pool.query('INSERT INTO compliance_statement_types(id,title,body) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[`b9e68b28-103a-4a95-81dd-${String(index+1).padStart(12,'0')}`,seed.title,seed.body]);
  await pool.query('UPDATE compliance_statement_types SET fields=$1 WHERE fields IS NULL',[JSON.stringify(fieldService.defaults)]);
  for(const [index,seed] of seeds.entries()){
    const buffer=await fs.readFile(path.join(__dirname,`../../templates/statements/${index+1}.docx`));
    const meta=await documents.inspect(buffer);
    await pool.query('UPDATE compliance_statement_types SET docx=$2,document_name=$3,body=$4,revision=revision+1 WHERE id=$1 AND docx IS NULL AND body=$5',[`b9e68b28-103a-4a95-81dd-${String(index+1).padStart(12,'0')}`,buffer,seed.title+'.docx',meta.body,seed.body]);
    const seedId=`b9e68b28-103a-4a95-81dd-${String(index+1).padStart(12,'0')}`;
    const current=(await pool.query('SELECT docx FROM compliance_statement_types WHERE id=$1',[seedId])).rows[0]?.docx;
    const previous=require('../../templates/statements/previous-hashes.json')[index+1];
    if(current&&createHash('sha256').update(current).digest('hex')===previous)await pool.query('UPDATE compliance_statement_types SET docx=$2,body=$3,revision=revision+1 WHERE id=$1 AND docx=$4',[seedId,buffer,meta.body,current]);
  }
}
async function types(publicOnly = false) { return (await pool.query(`SELECT id,title,body,active,revision,fields,document_name AS "documentName",(docx IS NOT NULL) AS "hasDocument" FROM compliance_statement_types ${publicOnly ? 'WHERE active=true' : ''} ORDER BY created_at,id`)).rows; }
async function getType(id, publicOnly = false, db = pool) {
  if (!uuid(id)) throw fail('ID surat tidak valid.');
  const result = await db.query(`SELECT id,title,body,active,revision,fields,document_name AS "documentName",(docx IS NOT NULL) AS "hasDocument" FROM compliance_statement_types WHERE id=$1 ${publicOnly ? 'AND active=true' : ''}`,[id]);
  if (!result.rows.length) throw fail('Jenis surat tidak ditemukan atau sudah dinonaktifkan.',404);
  return result.rows[0];
}
async function saveType(id,input,file,options) {
  let buffer=null,documentName=null;
  if(file){if(!/\.docx$/i.test(file.originalname))throw fail('Unggah file .docx.');buffer=file.buffer;documentName=file.originalname.slice(0,250);}
  else if(input?.sourceTypeId){await getType(input.sourceTypeId);const source=(await pool.query('SELECT docx,document_name,body FROM compliance_statement_types WHERE id=$1',[input.sourceTypeId])).rows[0];buffer=source.docx;documentName=source.document_name;if(!buffer)input={...input,body:source.body};}
  if(buffer){const meta=await documents.inspect(buffer,options);input={...input,body:meta.body};}
  const data = normalizeType(input);
  if(!buffer&&!id&&!data.body)throw fail('Unggah template Word, pilih template sumber, atau isi teks surat.');
  if (id && !uuid(id)) throw fail('ID surat tidak valid.');
  // Revalidate the retained Word placeholders when only fields are edited.
  if(id&&!buffer){const current=await getType(id);if(current.hasDocument)normalizeType({...input,body:current.body});}
  const params=[id||randomUUID(),data.title,data.body,data.active,JSON.stringify(data.fields),buffer,documentName];
  const result = id ? await pool.query('UPDATE compliance_statement_types SET title=$2,body=CASE WHEN docx IS NOT NULL AND $6::bytea IS NULL THEN body ELSE $3 END,active=$4,fields=$5,docx=COALESCE($6,docx),document_name=COALESCE($7,document_name),revision=revision+1,updated_at=now() WHERE id=$1 RETURNING id',params) : await pool.query('INSERT INTO compliance_statement_types(id,title,body,active,fields,docx,document_name) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',params);
  if (!result.rows.length) throw fail('Jenis surat tidak ditemukan.',404);
  return getType(result.rows[0].id);
}
async function submit(id,input,assignment=null) {
  const type = await getType(id,true);
  const data = normalizeSubmission(input,type.fields||fieldService.defaults);
  if (input.revision !== type.revision) throw fail('Isi surat berubah. Muat ulang dan baca kembali sebelum menandatangani.',409);
  const snapshotFields=structuredClone(type.fields||fieldService.defaults);
  if(assignment?.department&&!snapshotFields.some(f=>f.key==='departemen')){data.departemen=assignment.department;snapshotFields.push({key:'departemen',label:'Departemen',type:'text',public:false,value:assignment.department,required:false});}
  const snapshot = { assignmentYear:assignment?.year||null, title: type.title, body: render(type.body,data), revision: type.revision, fields:snapshotFields };
  const receipt = randomUUID();
  const buffer=await templateBuffer(id);
  const document=await documents.generate(buffer,data,data.signature||[]);
  snapshot.documentSha256=createHash('sha256').update(document).digest('hex');
  snapshot.sha256 = createHash('sha256').update(JSON.stringify({data,snapshot})).digest('hex');
  // Atomic revision check prevents submitting an old template during an edit.
  const result = await pool.query('INSERT INTO compliance_statement_submissions(id,type_id,nip,data,snapshot,document,assignment_year) SELECT $1,id,$3,$4,$5,$7,$9 FROM compliance_statement_types WHERE id=$2 AND active=true AND revision=$6 AND ($8::text IS NULL OR EXISTS(SELECT 1 FROM compliance_statement_assignments a JOIN compliance_statement_employees e ON e.nip=a.nip WHERE a.nip=$8 AND a.type_id=$2 AND a.year=$9 AND e.active)) RETURNING id,created_at',[receipt,id,data.nip,data,snapshot,type.revision,document,assignment?.nip||null,assignment?.year||null]);
  if (!result.rows.length) throw fail('Isi surat berubah. Muat ulang formulir.',409);
  return {...result.rows[0],documentContent:document.toString('base64')};
}
async function groups(search = '') {
  if (typeof search !== 'string' || search.length > 160) throw fail('Pencarian terlalu panjang.');
  return (await pool.query(`SELECT nip, jsonb_agg(jsonb_build_object('id',id,'typeId',type_id,'title',snapshot->>'title','name',data->>'nama','createdAt',created_at) ORDER BY created_at DESC) AS statements FROM compliance_statement_submissions WHERE nip IN (SELECT nip FROM compliance_statement_submissions WHERE position(lower($1) in lower(nip))>0 OR position(lower($1) in lower(data->>'nama'))>0) GROUP BY nip ORDER BY nip LIMIT 200`,[search.trim()])).rows;
}
async function submissions(query={}) {
  const q=field(query,'q',160,false),key=field(query,'field',40,false),value=field(query,'value',500,false),groupBy=field(query,'groupBy',40,false),typeId=field(query,'typeId',40,false);
  const page=Number(query.page||1);if(!Number.isInteger(page)||page<1||page>100000)throw fail('Halaman tidak valid.');
  if(typeId&&!uuid(typeId))throw fail('ID surat tidak valid.');
  const catalogue=(await pool.query(`SELECT DISTINCT f->>'key' AS key,f->>'label' AS label FROM (SELECT fields FROM compliance_statement_types UNION ALL SELECT snapshot->'fields' FROM compliance_statement_submissions) source CROSS JOIN LATERAL jsonb_array_elements(source.fields) f ORDER BY key,label`)).rows;
  if([key,groupBy].some(k=>k&&!catalogue.some(f=>f.key===k)))throw fail('Field tidak dikenal.');
  const match=field(query,'match',8,false)||'contains';if(!['contains','exact'].includes(match))throw fail('Pencocokan filter tidak valid.');const fieldCondition=match==='exact'?"COALESCE(data->>$2,'')=$3":"position(lower($3) in lower(COALESCE(data->>$2,'')))>0";
  const params=[q,key,value,typeId,groupBy];
  const where=`($1='' OR position(lower($1) in lower(snapshot->>'title'))>0 OR EXISTS(SELECT 1 FROM jsonb_each_text(data) d WHERE d.key NOT IN ('signature','signatureImage','consent') AND position(lower($1) in lower(d.value))>0)) AND ($2='' OR ${fieldCondition}) AND ($4='' OR type_id::text=$4)`;
  const total=(await pool.query(`SELECT count(*)::int AS total FROM compliance_statement_submissions WHERE ${where}`,params.slice(0,4))).rows[0].total;
  if(groupBy){
    const groups=(await pool.query(`SELECT COALESCE(NULLIF(data->>$5,''),'') AS value,count(*)::int AS count FROM compliance_statement_submissions WHERE ${where} GROUP BY 1 ORDER BY 1 LIMIT 50 OFFSET $6`,[...params,(page-1)*50])).rows;
    for(const group of groups)group.rows=(await pool.query(`SELECT id,type_id,snapshot->>'title' AS title,data-'signature'-'signatureImage'-'consent' AS data,created_at FROM compliance_statement_submissions WHERE ${where} AND COALESCE(NULLIF(data->>$5,''),'')=$6 ORDER BY created_at DESC,id LIMIT 100`,[...params,group.value])).rows;
    const groupTotal=(await pool.query(`SELECT count(DISTINCT COALESCE(NULLIF(data->>$5,''),''))::int AS total FROM compliance_statement_submissions WHERE ${where}`,params)).rows[0].total;
    return {fields:catalogue,total,groups,page,pages:Math.max(1,Math.ceil(groupTotal/50))};
  }
  const rows=(await pool.query(`SELECT id,type_id,snapshot->>'title' AS title,data-'signature'-'signatureImage'-'consent' AS data,created_at FROM compliance_statement_submissions WHERE ${where} ORDER BY created_at DESC,id LIMIT 50 OFFSET $5`,[...params.slice(0,4),(page-1)*50])).rows;
  return {fields:catalogue,total,rows,page,pages:Math.max(1,Math.ceil(total/50))};
}
async function annualRecap(query={}) {
 const q=field(query,'q',160,false),year=field(query,'year',4,false),page=Number(query.page||1);
 if(year&&!/^[0-9]{4}$/.test(year)||!Number.isInteger(page)||page<1||page>100000)throw fail('Filter rekap tidak valid.');
 const where=`($1='' OR position(lower($1) in lower(nip))>0 OR position(lower($1) in lower(data->>'nama'))>0) AND ($2='' OR extract(year FROM created_at AT TIME ZONE 'Asia/Bangkok')::text=$2)`;
 const total=(await pool.query(`SELECT count(*)::int AS total FROM (SELECT nip,extract(year FROM created_at AT TIME ZONE 'Asia/Bangkok') FROM compliance_statement_submissions WHERE ${where} GROUP BY 1,2) g`,[q,year])).rows[0].total;
 const rows=(await pool.query(`SELECT nip,extract(year FROM created_at AT TIME ZONE 'Asia/Bangkok')::int AS year,(array_agg(data->>'nama' ORDER BY created_at DESC))[1] AS name,jsonb_agg(jsonb_build_object('id',id,'typeId',type_id,'title',snapshot->>'title','createdAt',created_at) ORDER BY created_at DESC) AS statements FROM compliance_statement_submissions WHERE ${where} GROUP BY 1,2 ORDER BY 2 DESC,1 LIMIT 50 OFFSET $3`,[q,year,(page-1)*50])).rows;
 const activeTypes=(await types()).filter(t=>t.active).map(t=>({id:t.id,title:t.title}));
 for(const row of rows){const ids=new Set(row.statements.map(s=>s.typeId));row.completed=activeTypes.filter(t=>ids.has(t.id)).length;row.required=activeTypes.length;row.missing=activeTypes.filter(t=>!ids.has(t.id));}
 const years=(await pool.query(`SELECT DISTINCT extract(year FROM created_at AT TIME ZONE 'Asia/Bangkok')::int AS year FROM compliance_statement_submissions ORDER BY year DESC`)).rows.map(r=>r.year);
 return {rows,total,years,activeTypes,page,pages:Math.max(1,Math.ceil(total/50))};
}
async function submission(id) {
  if (!uuid(id)) throw fail('ID surat tidak valid.');
  const row = (await pool.query('SELECT id,type_id,nip,data,snapshot,created_at,(document IS NOT NULL) AS "hasDocument" FROM compliance_statement_submissions WHERE id=$1',[id])).rows[0];
  if (!row) throw fail('Surat tidak ditemukan.',404);
  return row;
}
async function deleteSubmission(id){
 if(!uuid(id))throw fail('ID surat tidak valid.');
 const result=await pool.query('DELETE FROM compliance_statement_submissions WHERE id=$1 RETURNING id',[id]);
 if(!result.rows.length)throw fail('Surat tidak ditemukan.',404);return {deleted:true,id};
}
async function templateBuffer(id){await getType(id);const row=(await pool.query('SELECT docx,body FROM compliance_statement_types WHERE id=$1',[id])).rows[0];return row.docx||documents.plain(row.body);}
async function preview(id,input,publicOnly=false){const type=await getType(id,publicOnly);if(input.revision!==undefined&&input.revision!==type.revision)throw fail('Template berubah. Muat ulang halaman.',409);const data=fieldService.values(input,type.fields||fieldService.defaults,{preview:true});return documents.generate(await templateBuffer(id),data,[],{preview:true});}
async function signedDocument(id){await submission(id);const row=(await pool.query('SELECT document FROM compliance_statement_submissions WHERE id=$1',[id])).rows[0];if(!row.document)throw fail('Surat lama ini belum memiliki dokumen Word. Gunakan tampilan teks.',404);return row.document;}
async function stats(){return (await pool.query('SELECT (SELECT count(*)::int FROM compliance_statement_types) AS types,(SELECT count(*)::int FROM compliance_statement_types WHERE active) AS active,(SELECT count(*)::int FROM compliance_statement_submissions) AS submissions,(SELECT count(DISTINCT type_id)::int FROM compliance_statement_submissions) AS people')).rows[0];}
async function saveDocument(id,input,file,options){
  const type=await getType(id);
  if(!file||!/\.docx$/i.test(file.originalname))throw fail('Unggah file .docx.');
  if(!Number.isInteger(input?.revision)||input.revision!==type.revision)throw fail('Template berubah. Muat ulang halaman.',409);
  const meta=await documents.inspect(file.buffer,options);
  const data=normalizeType({title:type.title,active:type.active,fields:input.fields??type.fields,body:meta.body});
  const result=await pool.query('UPDATE compliance_statement_types SET docx=$2,body=$3,document_name=COALESCE(document_name,$4),fields=$6,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$5 RETURNING id',[id,file.buffer,meta.body,file.originalname.slice(0,250),input.revision,JSON.stringify(data.fields)]);
  if(!result.rows.length)throw fail('Template berubah. Muat ulang halaman.',409);
  return getType(id);
}
module.exports = { ensureStore, normalizeType, normalizeSubmission, render, types, getType, saveType, submit, groups, submissions, annualRecap, submission, deleteSubmission, templateBuffer,preview,signedDocument,stats,saveDocument };
