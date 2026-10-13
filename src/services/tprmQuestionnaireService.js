const { pool } = require('../config/database');
const rules = require('../shared/tprmWorkflow');

const statuses = ['Draft', 'In progress', 'Complete', 'Expired', 'Final'];
const results = ['Pending', 'Approved', 'Approved with Conditions', 'Rejected'];
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function text(value) { return String(value ?? '').trim(); }
function dateOnly(value) { if (!value) return ''; if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10); const raw = text(value); const match = raw.match(/^\d{4}-\d{2}-\d{2}/); if (match) return match[0]; const parsed = new Date(raw); return Number.isNaN(parsed.valueOf()) ? '' : parsed.toISOString().slice(0, 10); }
function validate(data) { if (!text(data.vendorName)) throw invalid('vendorName is required'); if (!statuses.includes(data.status)) throw invalid('Invalid questionnaire status'); if (!results.includes(data.result)) throw invalid('Invalid assessment result'); }
function map(row) { return { id: row.id, vendorName: row.vendor_name, status: row.assessment_status, reviewDate: dateOnly(row.review_date), result: row.assessment_result, reviewer: row.reviewer, notes: row.notes, responses: { ...(row.responses || {}), ...rules.questionnaireScore(row.responses) }, createdAt: row.created_at, updatedAt: row.updated_at }; }
async function ensureStore() { await pool.query(`CREATE TABLE IF NOT EXISTS tprm_questionnaire_history (id BIGSERIAL PRIMARY KEY, questionnaire_id BIGINT NOT NULL, actor TEXT NOT NULL, snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); await pool.query(`CREATE TABLE IF NOT EXISTS tprm_due_diligence_questionnaires (id BIGSERIAL PRIMARY KEY, vendor_name TEXT NOT NULL, assessment_status TEXT NOT NULL DEFAULT 'Draft', review_date DATE, assessment_result TEXT NOT NULL DEFAULT 'Pending', reviewer TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', responses JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); await pool.query("ALTER TABLE tprm_due_diligence_questionnaires ADD COLUMN IF NOT EXISTS responses JSONB NOT NULL DEFAULT '{}'::jsonb"); }
async function list() { const result = await pool.query('SELECT *, review_date::text AS review_date FROM tprm_due_diligence_questionnaires ORDER BY updated_at DESC, id DESC'); return result.rows.map(map); }
async function get(id) { const result = await pool.query('SELECT *, review_date::text AS review_date FROM tprm_due_diligence_questionnaires WHERE id=$1', [id]); if (!result.rowCount) throw Object.assign(new Error('Questionnaire not found'), { status: 404 }); return map(result.rows[0]); }
async function normalize(data, current, db) {
  validate(data);
  if (current && data.vendorName !== current.vendorName) {
    const linked=await db.query('SELECT id FROM tprm_risk_register WHERE questionnaire_id=$1 LIMIT 1',[current.id]);
    if(linked.rowCount)throw invalid('Vendor terhubung ke TPRM. Nama harus dipertahankan untuk menjaga relasi assessment.');
  }
  let sections = current?.responses?.questionnaireSections;
  const templateId = data.responses?.templateId || current?.responses?.templateId;
  if (!sections || (templateId && String(templateId) !== String(current?.responses?.templateId))) {
    const template = await db.query(templateId ? 'SELECT * FROM questionnaire_templates WHERE id=$1' : 'SELECT * FROM questionnaire_templates ORDER BY is_default DESC, id LIMIT 1', templateId ? [templateId] : []);
    if (!template.rowCount) throw invalid('Questionnaire template not found');
    sections = template.rows[0].sections;
    data.responses = {...data.responses, templateId: template.rows[0].id};
  }
  const responses = {...(data.responses || {}), questionnaireSections: sections, ...rules.questionnaireScore(data.responses)};
  const changed = !current || data.vendorName !== current.vendorName || data.status !== current.status || data.result !== current.result || dateOnly(data.reviewDate) !== dateOnly(current.reviewDate) || text(data.notes) !== text(current.notes) || text(data.reviewer) !== text(current.reviewer) || rules.stableJson(responses) !== rules.stableJson({...current.responses, ...rules.questionnaireScore(current.responses)});
  if (changed) responses.revision = Number(current?.responses?.revision || 0) + 1;
  if (data.result !== 'Pending' && (!current || data.result !== current.result)) throw invalid('Keputusan approval harus dilakukan melalui workflow TPRM.');
  const result = changed ? 'Pending' : data.result;
  let status = changed && current?.status === 'Final' ? 'In progress' : data.status;
  if (status === 'Final' && (!current || changed || current.status !== 'Final')) throw invalid('Final hanya tersedia setelah approval workflow TPRM.');
  if (result !== 'Pending') status = 'Final';
  if (status === 'Final' && result === 'Pending') throw invalid('Final memerlukan keputusan approval workflow TPRM.');
  if (status === 'Complete' && !rules.questionnaireReadiness(responses).complete) throw invalid('Semua jawaban, keterangan, dokumen bukti, dan skor wajib lengkap.');
  responses.assessmentResult = result;
  return {...data, status, result, responses};
}
async function write(id, data, actor, options = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let current;
    if (id) {
      const existing = await client.query('SELECT *, review_date::text AS review_date FROM tprm_due_diligence_questionnaires WHERE id=$1 FOR UPDATE',[id]);
      if (!existing.rowCount) throw Object.assign(new Error('Questionnaire not found'),{status:404});
      current=map(existing.rows[0]);
      if (options.expectedRevision !== undefined && Number(options.expectedRevision) !== Number(current.responses?.revision || 0)) throw Object.assign(new Error('Assessment berubah selama import. Buka pratinjau ulang sebelum menyimpan.'),{status:409});
      if (options.preserveInternal) data={...data,vendorName:current.vendorName,reviewDate:current.reviewDate,reviewer:current.reviewer,notes:current.notes};
    }
    data=await normalize(data,current,client);
    if (options.expectedSections && rules.stableJson(data.responses.questionnaireSections)!==rules.stableJson(options.expectedSections)) throw Object.assign(new Error('Template berubah selama import. Export ulang Excel.'),{status:409});
    const values=[text(data.vendorName),data.status,dateOnly(data.reviewDate)||null,data.result,text(data.reviewer),text(data.notes),JSON.stringify(data.responses)];
    const query=id ? 'UPDATE tprm_due_diligence_questionnaires SET vendor_name=$1, assessment_status=$2, review_date=$3, assessment_result=$4, reviewer=$5, notes=$6, responses=$7, updated_at=NOW() WHERE id=$8 RETURNING *, review_date::text AS review_date' : 'INSERT INTO tprm_due_diligence_questionnaires (vendor_name,assessment_status,review_date,assessment_result,reviewer,notes,responses) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *, review_date::text AS review_date';
    if(id)values.push(id);
    const result=await client.query(query,values);
    await client.query('INSERT INTO tprm_questionnaire_history (questionnaire_id,actor,snapshot) VALUES ($1,$2,$3)',[result.rows[0].id,actor?.username || 'system',JSON.stringify({before:current,after:map(result.rows[0])})]);
    await client.query('COMMIT');
    return map(result.rows[0]);
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
async function create(data,actor) {return write(null,data,actor);}
async function update(id,data,actor,options) {return write(id,data,actor,options);}
async function remove(id) { const linked=await pool.query('SELECT id FROM tprm_risk_register WHERE questionnaire_id=$1 LIMIT 1',[id]); if(linked.rowCount)throw Object.assign(new Error('Kuesioner digunakan vendor TPRM. Riwayat assessment harus dipertahankan.'),{status:409}); const result = await pool.query('DELETE FROM tprm_due_diligence_questionnaires WHERE id = $1', [id]); if (!result.rowCount) throw Object.assign(new Error('Questionnaire not found'), { status: 404 }); }
module.exports = { ensureStore, list, get, create, update, remove };
