const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { pool } = require('../config/database');
const numbering=require('./gapNumberService');
const access = require('./evidenceAccessService');
const permissionKeys = { csf:'assessment', privacy:'privacy-assessment', ikas:'ikas-assessment', iso27001:'iso27001', 'iso27001-soa':'iso27001-soa' };
const fail = (message,status=400) => Object.assign(new Error(message),{status});
let ready;
function ensureStore() {
  if (!ready) ready = fs.readFile(path.join(__dirname,'../../database/assessment-gaps.sql'),'utf8').then(sql=>pool.query(sql)).catch(error=>{ready=null;throw error;});
  return ready;
}
function validate(data) {
  if (!data || typeof data.description!=='string' || !data.description.trim() || data.description.trim().length>4000) throw fail('Deskripsi gap wajib diisi (maksimal 4000 karakter).');
  if (!['Open','Closed'].includes(data.status)) throw fail('Status gap harus Open atau Closed.');
  if (!Array.isArray(data.evidence) || data.evidence.length>20 || data.evidence.some(file=>!file || typeof file.path!=='string')) throw fail('Evidence gap tidak valid (maksimal 20 file).');
  const details={};
  if(data.details!==undefined && (!data.details || typeof data.details!=='object' || Array.isArray(data.details))) throw fail('Rincian gap tidak valid.');
  for(const key of ['domain','sub','dimension','gapNumber','client','pic','initiative','recommendation','yearOfInitiative','quarter','confirmation','supportingDocuments','decisionNote']) {
    const value=data.details?.[key] ?? '';
    if(typeof value!=='string'||value.length>4000) throw fail(`Rincian ${key} maksimal 4000 karakter.`);
    details[key]=value.trim();
  }
  if(data.details?.gapNumberMode!==undefined){
    if(!['auto','manual'].includes(data.details.gapNumberMode))throw fail('Mode nomor gap tidak valid.');
    details.gapNumberMode=data.details.gapNumberMode;
  }
  if(details.quarter && !['Q1','Q2','Q3','Q4'].includes(details.quarter)) throw fail('Kuartal harus Q1, Q2, Q3, atau Q4.');
  if(details.yearOfInitiative && !/^[1-9][0-9]{3}$/.test(details.yearOfInitiative)) throw fail('Year of Initiative harus tahun empat digit (1000?9999).');
  if(details.dimension && !['People','Process','Technology'].includes(details.dimension)) throw fail('Kategori harus People, Process, atau Technology.');
  if(data.details!==undefined && !['Comply','Partially Comply','Not Comply'].includes(details.decisionNote)) throw fail('Decision harus Comply, Partially Comply, atau Not Comply.');
  return {description:data.description.trim(),status:data.status,evidence:data.evidence,...(data.details!==undefined?{details}: {})};
}
function linkedDetails(framework,code,control,details={}) {
  if(framework!=='csf')return details;
  const domain=(control?.function || '').split(':')[0].trim();
  const sub=(control?.subcategory || '').match(/^\s*([^:]+):/)?.[1]?.trim() || code.replace(/^([A-Z]{2})-([A-Z]{2})-/, '$1.$2-');
  return {...details,domain,sub};
}
const columns = `id,framework_id AS "framework",control_code AS "controlCode",description,status,evidence,details,created_by AS "createdBy",updated_by AS "updatedBy",created_at AS "createdAt",updated_at AS "updatedAt"`;
async function list(framework) {
  await ensureStore();
  const rows=(await pool.query(`SELECT ${columns} FROM assessment_gaps WHERE framework_id=$1 ORDER BY created_at,id`,[framework])).rows;
  if(framework!=='csf')return rows;
  const controls=(await pool.query('SELECT code,function,subcategory FROM controls WHERE framework_id=$1',[framework])).rows;
  const byCode=new Map(controls.map(row=>[row.code,row]));
  return rows.map(row=>({...row,details:linkedDetails(framework,row.controlCode,byCode.get(row.controlCode),row.details)}));
}
async function save(framework,code,id,data,user) {
  const value=validate(data);
  await ensureStore();
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['gap-numbers:'+framework]);
    // Serialize edits, evidence detachment and deletion for the same gap.
    const previous=id ? (await client.query('SELECT * FROM assessment_gaps WHERE id=$1 AND framework_id=$2 AND control_code=$3 FOR UPDATE',[id,framework,code])).rows[0] : null;
    if(id && !previous) throw fail('Gap tidak ditemukan.',404);
    const control=await client.query('SELECT 1,function,subcategory FROM controls WHERE framework_id=$1 AND code=$2 FOR KEY SHARE',[framework,code]);
    if(!control.rowCount) throw fail('Item assessment tidak ditemukan.',404);
    if(framework==='csf')value.details=linkedDetails(framework,code,control.rows?.[0],value.details ?? previous?.details);
    if(previous && data.updatedAt!==new Date(previous.updated_at).toISOString()) throw fail('Gap telah diperbarui pengguna lain. Muat ulang sebelum menyimpan.',409);
    await access.assertReferences(value.evidence,previous?.evidence || [],user);
    // Resolve metadata from the library, rather than trusting client filenames or URLs.
    const evidence=[];
    for(const file of value.evidence) {
      const normalized=access.normalize(file.path);
      if(evidence.some(item=>access.normalize(item.path)===normalized)) continue;
      const stored=(await client.query('SELECT path,name,mime_type FROM evidence_files WHERE path=$1 FOR KEY SHARE',[normalized])).rows[0];
      if(!stored) throw fail('Evidence sudah dihapus. Pilih file yang tersedia.',409);
      evidence.push({path:'upload/'+stored.path,name:stored.name,type:stored.mime_type});
    }
    const numberRows=(await client.query('SELECT id,details FROM assessment_gaps WHERE framework_id=$1',[framework])).rows;
    value.details=numbering.assign(value.details ?? previous?.details ?? {},numberRows,id);
    const actor=user?.username || '';
    const result=id ? await client.query(`UPDATE assessment_gaps SET description=$4,status=$5,evidence=$6,updated_by=$7,details=$8,updated_at=NOW() WHERE id=$1 AND framework_id=$2 AND control_code=$3 RETURNING ${columns}`,[id,framework,code,value.description,value.status,JSON.stringify(evidence),actor,JSON.stringify(value.details ?? previous?.details ?? {})])
      : await client.query(`INSERT INTO assessment_gaps(id,framework_id,control_code,description,status,evidence,created_by,updated_by,details) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8) RETURNING ${columns}`,[crypto.randomUUID(),framework,code,value.description,value.status,JSON.stringify(evidence),actor,JSON.stringify(value.details || {})]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch(error) { await client.query('ROLLBACK');throw error; }
  finally {client.release();}
}
async function remove(framework,code,id,user,updatedAt) {
  await ensureStore();
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const row=(await client.query('SELECT * FROM assessment_gaps WHERE id=$1 AND framework_id=$2 AND control_code=$3 FOR UPDATE',[id,framework,code])).rows[0];
    if(!row) throw fail('Gap tidak ditemukan.',404);
    if(updatedAt!==new Date(row.updated_at).toISOString()) throw fail('Gap telah diperbarui pengguna lain. Muat ulang sebelum menghapus.',409);
    await access.assertReferences([],row.evidence,user);
    await client.query('DELETE FROM assessment_gaps WHERE id=$1',[id]);
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
}
function summary(rows) {
  return { total:rows.length, open:rows.filter(row=>row.status==='Open').length, closed:rows.filter(row=>row.status==='Closed').length,
    withoutEvidence:rows.filter(row=>!row.evidence?.length).length, affectedControls:new Set(rows.map(row=>row.controlCode)).size };
}
async function importGaps(framework,rows,user) {
  if(!Array.isArray(rows)||rows.length>5000)throw fail('Daftar gap import tidak valid (maksimal 5000 gap).');
  const ids=new Set();
  const values=rows.map(row=>{
    const value=validate(row);
    if(typeof row.controlCode!=='string'||!row.controlCode.trim()||(row.framework!==undefined&&row.framework!==framework))throw fail('Framework atau kontrol gap import tidak sesuai.');
    const id=row.id || crypto.randomUUID();
    if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||ids.has(id.toLowerCase()))throw fail('ID gap import tidak valid atau duplikat.');
    ids.add(id.toLowerCase());return {...value,id,controlCode:row.controlCode.trim()};
  });
  await ensureStore();const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['gap-numbers:'+framework]);
    const numberRows=(await client.query('SELECT id,details FROM assessment_gaps WHERE framework_id=$1',[framework])).rows;
    const prepared=[];
    // Validate every reference before writing any finding; imports merge by stable UUID.
    for(const row of values.sort((a,b)=>a.id.localeCompare(b.id))) {
      const existing=(await client.query('SELECT * FROM assessment_gaps WHERE id=$1 FOR UPDATE',[row.id])).rows[0];
      if(existing&&(existing.framework_id!==framework||existing.control_code!==row.controlCode))throw fail('ID gap sudah digunakan oleh kontrol atau framework lain.',409);
      const control=await client.query('SELECT 1,function,subcategory FROM controls WHERE framework_id=$1 AND code=$2 FOR KEY SHARE',[framework,row.controlCode]);
      if(!control.rowCount)throw fail(`Kontrol gap ${row.controlCode} tidak tersedia. Import kontrol terlebih dahulu.`,400);
      if(framework==='csf')row.details=linkedDetails(framework,row.controlCode,control.rows?.[0],row.details ?? existing?.details);
      await access.assertReferences(row.evidence,existing?.evidence||[],user);
      const evidence=[];
      for(const file of row.evidence){
        const normalized=access.normalize(file.path);
        if(evidence.some(item=>access.normalize(item.path)===normalized))continue;
        const stored=(await client.query('SELECT path,name,mime_type FROM evidence_files WHERE path=$1 FOR KEY SHARE',[normalized])).rows[0];
        if(!stored)throw fail(`Evidence gap ${row.controlCode} tidak tersedia. Pulihkan backup file terlebih dahulu.`,400);
        evidence.push({path:'upload/'+stored.path,name:stored.name,type:stored.mime_type});
      }
      row.details=numbering.assign(row.details ?? existing?.details ?? {},numberRows,row.id);
      const numberIndex=numberRows.findIndex(item=>item.id===row.id);
      if(numberIndex>=0)numberRows.splice(numberIndex,1);
      numberRows.push({id:row.id,details:row.details});
      prepared.push({...row,evidence});
    }
    for(const row of prepared)await client.query(`INSERT INTO assessment_gaps(id,framework_id,control_code,description,status,evidence,created_by,updated_by,details)
      VALUES($1,$2,$3,$4,$5,$6,$7,$7,COALESCE($8::jsonb,'{}'::jsonb)) ON CONFLICT(id) DO UPDATE SET details=COALESCE($8::jsonb,assessment_gaps.details),description=EXCLUDED.description,status=EXCLUDED.status,evidence=EXCLUDED.evidence,updated_by=EXCLUDED.updated_by,updated_at=NOW()
      WHERE assessment_gaps.framework_id=EXCLUDED.framework_id AND assessment_gaps.control_code=EXCLUDED.control_code RETURNING id`,[row.id,framework,row.controlCode,row.description,row.status,JSON.stringify(row.evidence),user?.username||'',row.details ? JSON.stringify(row.details) : null]).then(result=>{if(!result.rowCount)throw fail('ID gap bertabrakan dengan kontrol lain.',409);});
    await client.query('COMMIT');return {imported:prepared.length};
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
module.exports={linkedDetails,ensureStore,permissionKeys,validate,list,save,remove,summary,importGaps};
