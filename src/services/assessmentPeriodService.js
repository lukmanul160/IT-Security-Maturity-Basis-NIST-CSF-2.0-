const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { pool } = require('../config/database');
const access = require('./evidenceAccessService');
const gaps = require('./assessmentGapService');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const permissions = { csf: ['assessment'], privacy: ['privacy-assessment'], iso27001: ['iso27001', 'iso27001-soa'] };
const controlFields = ['function','category','subcategory','implementation','references','minimumEvidence','notes','applicability'];
const validId = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
let ready;
function ensureStore() {
  if (!ready) ready = fs.readFile(path.join(__dirname, '../../database/assessment-periods.sql'), 'utf8')
    .then(sql => pool.query(sql)).catch(error => { ready = null; throw error; });
  return ready;
}
function validateYear(value) {
  if (!['string','number'].includes(typeof value) || !/^\d{4}$/.test(String(value)) || Number(value) < 2000 || Number(value) > 2100) throw fail('Tahun assessment harus antara 2000 dan 2100.');
  return Number(value);
}
function validateFramework(framework) {
  if (!Object.hasOwn(permissions, framework)) throw fail('Framework assessment tidak tersedia.', 404);
  return framework;
}
function emptyAssessment() { return { scores:{}, policyScores:{}, practiceScores:{}, notes:{}, attachments:{}, targetScores:{} }; }
async function list(framework) {
  validateFramework(framework); await ensureStore();
  return (await pool.query(`SELECT assessment_year AS year,source_year AS "sourceYear",creation_mode AS mode,legacy,created_at AS "createdAt" FROM assessment_periods WHERE framework_id=$1 ORDER BY assessment_year DESC`, [framework])).rows;
}
async function period(framework, year, client = pool, lock = '') {
  validateFramework(framework); validateYear(year);
  const row = (await client.query(`SELECT * FROM assessment_periods WHERE framework_id=$1 AND assessment_year=$2 ${lock}`, [framework, year])).rows[0];
  if (!row) throw fail('Assessment tahun ini belum dibuat. Pilih New atau Duplicate terlebih dahulu.', 404);
  return row;
}
async function legacySnapshot(framework, client) {
  await gaps.ensureStore();
  const frameworks = framework === 'iso27001' ? ['iso27001','iso27001-soa'] : [framework];
  const data = { assessment:emptyAssessment(), controls:{}, targets:{}, gaps:{}, objectives:[] };
  const controls = (await client.query(`SELECT framework_id,code AS id,function,category,subcategory,implementation,"references",minimum_evidence AS "minimumEvidence",notes,evidence,applicability FROM controls WHERE framework_id=ANY($1::text[]) ORDER BY code`, [frameworks])).rows;
  const targets = (await client.query(`SELECT framework_id,category,target_score AS "targetScore" FROM framework_category_targets WHERE framework_id=ANY($1::text[]) ORDER BY category`, [frameworks])).rows;
  const findings = (await client.query(`SELECT id,framework_id AS framework,control_code AS "controlCode",description,status,evidence,created_by AS "createdBy",updated_by AS "updatedBy",created_at AS "createdAt",updated_at AS "updatedAt" FROM assessment_gaps WHERE framework_id=ANY($1::text[]) ORDER BY created_at,id`, [frameworks])).rows;
  for (const id of frameworks) {
    data.controls[id] = controls.filter(row => row.framework_id === id).map(({framework_id,...row}) => row);
    data.targets[id] = targets.filter(row => row.framework_id === id).map(({framework_id,...row}) => row);
    data.gaps[id] = findings.filter(row => row.framework === id);
  }
  if (framework !== 'iso27001') data.assessment = (await client.query('SELECT data FROM assessment_state WHERE id=$1', [framework === 'csf' ? 'default' : 'privacy'])).rows[0]?.data || emptyAssessment();
  else data.objectives = (await client.query(`SELECT id,objective_year AS year,objective,indicator,baseline,target_value AS "targetValue",owner,evaluation_frequency AS "evaluationFrequency",period_targets AS "periodTargets",monthly_status AS "monthlyStatus",quarterly_status AS "quarterlyStatus",semester_status AS "semesterStatus",annual_status AS "annualStatus",notes FROM information_security_objectives WHERE objective_year=2026 ORDER BY id`)).rows;
  return data;
}
function prepareSnapshot(source, mode, year, actor) {
  const data = structuredClone(source);
  if (mode === 'new') {
    data.assessment = emptyAssessment(); data.objectives = [];
    for (const framework of Object.keys(data.controls)) {
      data.controls[framework] = data.controls[framework].map(row => ({...row,notes:'',evidence:[],applicability:'Applicable'}));
      data.targets[framework] = [...new Set(data.controls[framework].map(row => row.category))].map(category => ({category,targetScore:3}));
      data.gaps[framework] = [];
    }
  } else {
    const now = new Date().toISOString();
    for (const framework of Object.keys(data.gaps)) data.gaps[framework] = data.gaps[framework].map(row => ({...row,id:crypto.randomUUID(),createdBy:actor,updatedBy:actor,createdAt:now,updatedAt:now}));
    data.objectives = data.objectives.map((row, index) => ({...row,id:index + 1,year}));
  }
  return data;
}
function references(data) {
  return [ ...Object.values(data.assessment?.attachments || {}).flat(),
    ...Object.values(data.controls || {}).flat().flatMap(row => row.evidence || []),
    ...Object.values(data.gaps || {}).flat().flatMap(row => row.evidence || []) ];
}
async function persist(client, framework, year, data) {
  const paths = [...new Set(references(data).map(file => access.normalize(file.path)))].sort();
  // Lock referenced files until commit so deletion cannot leave dangling links.
  if (paths.length) {
    const available = await client.query('SELECT path FROM evidence_files WHERE path=ANY($1::text[]) ORDER BY path FOR KEY SHARE', [paths]);
    if (available.rowCount !== paths.length) throw fail('Evidence sudah dihapus. Muat ulang assessment sebelum menyimpan.', 409);
  }
  await client.query('UPDATE assessment_periods SET data=$3::jsonb,updated_at=NOW() WHERE framework_id=$1 AND assessment_year=$2', [framework,year,JSON.stringify(data)]);
  await client.query('DELETE FROM assessment_period_files WHERE framework_id=$1 AND assessment_year=$2', [framework,year]);
  if (paths.length) await client.query('INSERT INTO assessment_period_files(framework_id,assessment_year,path) SELECT $1,$2,unnest($3::text[])', [framework,year,paths]);
}
async function create(framework, input, user) {
  validateFramework(framework);
  const year = validateYear(input?.year), sourceYear = validateYear(input?.sourceYear ?? 2026);
  if (!['new','duplicate'].includes(input?.mode)) throw fail('Pilih New atau Duplicate.');
  if (year === sourceYear) throw fail('Tahun tujuan harus berbeda dari tahun sumber.');
  await ensureStore(); await gaps.ensureStore();
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const source = await period(framework,sourceYear,client,'FOR SHARE');
    const data = prepareSnapshot(source.legacy ? await legacySnapshot(framework,client) : source.data,input.mode,year,user?.username || '');
    await client.query(`INSERT INTO assessment_periods(framework_id,assessment_year,data,source_year,creation_mode,created_by) VALUES($1,$2,$3::jsonb,$4,$5,$6)`, [framework,year,JSON.stringify(data),sourceYear,input.mode,user?.username || '']);
    await persist(client,framework,year,data);
    await client.query('COMMIT'); return {framework,year,sourceYear,mode:input.mode};
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') throw fail('Assessment untuk tahun tersebut sudah tersedia. Pilih tahun yang ada.',409);
    throw error;
  } finally { client.release(); }
}
async function mutate(framework, year, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const row = await period(framework,year,client,'FOR UPDATE');
    if (row.legacy) throw fail('Gunakan endpoint assessment awal untuk tahun ini.',409);
    const result = await operation(row.data,client);
    await persist(client,framework,year,row.data);
    await client.query('COMMIT'); return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function validateAssessment(next, previous, user) {
  if (!object(next)) throw fail('Data assessment tidak valid.');
  for (const key of ['scores','policyScores','practiceScores','notes','attachments','targetScores']) {
    if (next[key] !== undefined && !object(next[key])) throw fail(`Assessment ${key} tidak valid.`);
  }
  for (const key of ['scores','policyScores','practiceScores','targetScores']) for (const value of Object.values(next[key] || {})) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 5) throw fail('Skor assessment harus antara 0 dan 5.');
  }
  for (const value of Object.values(next.notes || {})) if (typeof value !== 'string') throw fail('Catatan assessment tidak valid.');
  for (const key of new Set([...Object.keys(previous?.attachments || {}),...Object.keys(next.attachments || {})])) await access.assertReferences(next.attachments?.[key] || [],previous?.attachments?.[key] || [],user);
  return {...emptyAssessment(),...next};
}
async function canonicalEvidence(files, previous, user, client) {
  await access.assertReferences(files,previous,user);
  const result = [];
  for (const file of files) {
    const normalized = access.normalize(file.path);
    if (result.some(item => access.normalize(item.path) === normalized)) continue;
    const stored = (await client.query('SELECT path,name,mime_type FROM evidence_files WHERE path=$1 FOR KEY SHARE', [normalized])).rows[0];
    if (!stored) throw fail('Evidence sudah dihapus.',409);
    result.push({path:'upload/'+stored.path,name:stored.name,type:stored.mime_type});
  }
  return result;
}
async function controlMutation(data, client, descriptor, method, body, user) {
  const {framework,code,evidenceOnly} = descriptor, rows = data.controls[framework];
  const index = rows.findIndex(row => row.id === code), previous = rows[index];
  if (method !== 'POST' && !previous) throw fail('Kontrol assessment tidak ditemukan.',404);
  if (method === 'DELETE') {
    await access.assertReferences([],previous.evidence || [],user);
    for (const gap of data.gaps[framework].filter(row => row.controlCode === code)) await access.assertReferences([],gap.evidence,user);
    rows.splice(index,1); data.gaps[framework] = data.gaps[framework].filter(row => row.controlCode !== code); return null;
  }
  if (!object(body)) throw fail('Data kontrol tidak valid.');
  const value = method === 'POST' ? {id:body.id,evidence:[],notes:'',applicability:'Applicable'} : {...previous};
  if (method === 'POST') {
    if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 200) throw fail('ID kontrol wajib diisi.');
    value.id = value.id.trim();
    if (rows.some(row => row.id === value.id)) throw fail('ID kontrol sudah tersedia.',409);
  }
  for (const field of evidenceOnly ? [] : controlFields) {
    const item = field === 'minimumEvidence' ? body.minimumEvidence ?? body.minimum_evidence : body[field];
    if (item !== undefined) { if (typeof item !== 'string') throw fail('Isi kontrol tidak valid.'); value[field] = item; }
  }
  if (method === 'POST' && ['function','category','subcategory'].some(field => !value[field]?.trim())) throw fail('Function, category, dan subcategory wajib diisi.');
  if (!['Applicable','Not applicable'].includes(value.applicability)) throw fail('Applicability tidak valid.');
  if (body.evidence !== undefined) value.evidence = await canonicalEvidence(body.evidence,previous?.evidence || [],user,client);
  if (evidenceOnly && body.evidence === undefined) throw fail('Evidence wajib diisi.');
  if (method === 'POST') rows.push(value); else rows[index] = value;
  return value;
}
async function gapMutation(data, client, descriptor, method, body, user) {
  const {framework,code,id} = descriptor, rows = data.gaps[framework];
  if (descriptor.import) {
    if (!Array.isArray(body?.gaps) || body.gaps.length > 5000) throw fail('Daftar gap import tidak valid.');
    const seen = new Set();
    for (const item of body.gaps) {
      const gapId = item.id || crypto.randomUUID();
      if (!validId(gapId) || seen.has(gapId) || (item.framework && item.framework !== framework)) throw fail('ID atau framework gap import tidak valid.');
      seen.add(gapId);
      const old = rows.find(row => row.id === gapId);
      if (old && old.controlCode !== item.controlCode) throw fail('ID gap sudah dipakai kontrol lain.',409);
      await gapMutation(data,client,{framework,code:item.controlCode,id:old?.id},old?'PUT':'POST',{...item,id:gapId,updatedAt:old?.updatedAt},user);
    }
    return {imported:body.gaps.length};
  }
  if(id && !validId(id))throw fail('ID gap tidak valid.');
  if(body?.id && !validId(body.id))throw fail('ID gap tidak valid.');
  if (!data.controls[framework].some(row => row.id === code)) throw fail('Kontrol gap tidak tersedia.',404);
  const index = rows.findIndex(row => row.id === id && row.controlCode === code), previous = rows[index];
  if (id && !previous) throw fail('Gap tidak ditemukan.',404);
  if (previous && body?.updatedAt !== previous.updatedAt) throw fail('Gap telah diperbarui pengguna lain. Muat ulang sebelum menyimpan.',409);
  if (method === 'DELETE') { await access.assertReferences([],previous.evidence,user); rows.splice(index,1); return {ok:true}; }
  const value = gaps.validate(body), now = new Date(Math.max(Date.now(),previous?Date.parse(previous.updatedAt)+1:0)).toISOString();
  if(body.id && Object.values(data.gaps).flat().some(row=>row.id===body.id && row!==previous))throw fail('ID gap sudah digunakan kontrol lain.',409);
  const row = {...value,id:previous?.id || body.id || crypto.randomUUID(),framework,controlCode:code,
    evidence:await canonicalEvidence(value.evidence,previous?.evidence || [],user,client),
    createdBy:previous?.createdBy || user.username,updatedBy:user.username,createdAt:previous?.createdAt || now,updatedAt:now};
  if (previous) rows[index] = row; else rows.push(row); return row;
}
async function execute(owner, year, descriptor, method, body, user, query = {}) {
  if (method === 'GET') {
    const data = (await period(owner,year)).data;
    if (descriptor.kind === 'assessment') return data.assessment;
    if (descriptor.kind === 'controls') return [...data.controls[descriptor.framework]].sort((a,b) => a.id.localeCompare(b.id,undefined,{numeric:true}));
    if (descriptor.kind === 'targets') return data.targets[descriptor.framework];
    if (descriptor.kind === 'gaps') return data.gaps[descriptor.framework];
    if (descriptor.kind === 'objectives') return data.objectives.filter(row => !query.year || row.year === Number(query.year));
    throw fail('Endpoint assessment tidak tersedia.',404);
  }
  return mutate(owner,year,async(data,client) => {
    if (descriptor.kind === 'assessment') {
      if (descriptor.reset) { for (const files of Object.values(data.assessment.attachments || {})) await access.assertReferences([],files,user); data.assessment = emptyAssessment(); return null; }
      return data.assessment = await validateAssessment(body,data.assessment,user);
    }
    if (descriptor.kind === 'controls') return controlMutation(data,client,descriptor,method,body,user);
    if (descriptor.kind === 'gaps') return gapMutation(data,client,descriptor,method,body,user);
    if (descriptor.kind === 'targets') {
      const score = Number(body?.targetScore);
      if (!descriptor.category?.trim() || !Number.isFinite(score) || score < 0 || score > 5) throw fail('Target score harus antara 0 dan 5.');
      const rows = data.targets[descriptor.framework], value = {category:descriptor.category,targetScore:Math.round(score*10)/10};
      const index = rows.findIndex(row => row.category === value.category); if (index < 0) rows.push(value); else rows[index] = value;
      return value;
    }
    if (descriptor.kind === 'objectives') {
      const rows = data.objectives, index = rows.findIndex(row => String(row.id) === descriptor.id);
      if (descriptor.id && index < 0) throw fail('Sasaran tidak ditemukan.',404);
      if (method === 'DELETE') { rows.splice(index,1); return null; }
      const value = require('./frameworkService').normalizeObjective(body);
      if (value.year !== year) throw fail('Tahun sasaran harus sesuai tahun assessment.');
      const row = {...value,id:descriptor.id ? rows[index].id : Math.max(0,...rows.map(item => Number(item.id))) + 1};
      if (index < 0) rows.push(row); else rows[index] = row; return row;
    }
    if (descriptor.kind === 'iso-reset') {
      for (const file of references(data)) await access.assertReferences([], [file], user);
      for (const rows of Object.values(data.controls)) for (const row of rows) { row.evidence = []; row.notes = ''; }
      data.objectives = []; return null;
    }
    throw fail('Endpoint assessment tidak tersedia.',404);
  });
}
async function fileReferenceCount(normalized) {
  if (!(await pool.query("SELECT to_regclass('assessment_period_files') AS table_name")).rows[0]?.table_name) return 0;
  return Number((await pool.query('SELECT COUNT(*)::int AS count FROM assessment_period_files WHERE path=$1',[normalized])).rows[0]?.count || 0);
}
async function detachFile(client, normalized) {
  if (!(await client.query("SELECT to_regclass('assessment_period_files') AS table_name")).rows[0]?.table_name) return;
  const rows = (await client.query(`SELECT p.* FROM assessment_periods p JOIN assessment_period_files f USING(framework_id,assessment_year) WHERE f.path=$1 ORDER BY p.framework_id,p.assessment_year FOR UPDATE OF p`,[normalized])).rows;
  const keep = files => files.filter(file => access.normalize(file.path) !== normalized);
  for (const row of rows) {
    for (const [key,files] of Object.entries(row.data.assessment?.attachments || {})) row.data.assessment.attachments[key] = keep(files);
    for (const item of [...Object.values(row.data.controls || {}).flat(),...Object.values(row.data.gaps || {}).flat()]) item.evidence = keep(item.evidence || []);
    await persist(client,row.framework_id,row.assessment_year,row.data);
  }
}
module.exports = {ensureStore,permissions,validateYear,list,period,create,execute,prepareSnapshot,references,fileReferenceCount,detachFile};
