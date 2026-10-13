const { pool } = require('../config/database');
const workflowRules = require('../shared/tprmWorkflow');

const levels = ['High Risk (Tier 1)', 'Medium Risk (Tier 2)', 'Low Risk (Tier 3)'];
const statuses = ['Not started', 'In progress', 'Complete', 'Accepted'];
const relationshipStatuses = ['Pending', 'Active', 'Offboarding', 'Offboarded', 'Expired', 'Terminated'];
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function text(value) { return String(value ?? '').trim(); }
function normalizeRiskLevel(value) { const candidate = text(value); return levels.includes(candidate) ? candidate : 'Medium Risk (Tier 2)'; }
function normalizeAssessmentStatus(value) { const candidate = text(value); return statuses.includes(candidate) ? candidate : 'Not started'; }
function normalizeRelationshipStatus(value) { const candidate = text(value); const match = relationshipStatuses.find(status => status.toLowerCase() === candidate.toLowerCase()); return match || 'Pending'; }
async function validate(data, db = pool) { if (!text(data.thirdParty) || !text(data.serviceDependency)) throw invalid('thirdParty and serviceDependency are required'); if (data.riskLevel && !levels.includes(data.riskLevel)) throw invalid('Invalid risk level'); if (data.assessmentStatus && !statuses.includes(data.assessmentStatus)) throw invalid('Invalid assessment status'); if (data.relationshipStatus && !relationshipStatuses.some(status => status.toLowerCase() === text(data.relationshipStatus).toLowerCase())) throw invalid('Invalid relationship status'); if (data.nextReview && !/^\d{4}-\d{2}-\d{2}$/.test(data.nextReview)) throw invalid('nextReview must be a valid date'); const questionnaireId = Number(data.questionnaireId); if (!Number.isSafeInteger(questionnaireId) || questionnaireId < 1) throw invalid('A vendor from Vendor assessments is required'); const questionnaire = await db.query('SELECT vendor_name FROM tprm_due_diligence_questionnaires WHERE id = $1', [questionnaireId]); if (!questionnaire.rowCount || questionnaire.rows[0].vendor_name !== text(data.thirdParty)) throw invalid('Selected vendor assessment does not match thirdParty'); return questionnaireId; }
function map(row) { return { id: row.id, thirdParty: row.third_party, questionnaireId: row.questionnaire_id, serviceDependency: row.service_dependency, riskLevel: workflowRules.cia(row.due_diligence_assessment).riskTier || 'Not assessed', assessmentStatus: row.assessment_status, relationshipStatus: row.relationship_status || 'Active', nextReview: row.next_review, notes: row.notes, riskRegisterIds: Array.isArray(row.risk_register_ids) ? row.risk_register_ids : [], dueDiligenceAssessment: workflowRules.cia(row.due_diligence_assessment), workflow: row.workflow || {}, createdAt: row.created_at, updatedAt: row.updated_at }; }
function riskRegisterIds(value) { return Array.isArray(value) ? value.map(item => text(item)).filter(Boolean) : []; }
async function ensureStore() { await pool.query(`CREATE TABLE IF NOT EXISTS tprm_risk_register (id BIGSERIAL PRIMARY KEY, third_party TEXT NOT NULL, service_dependency TEXT NOT NULL, risk_level TEXT NOT NULL DEFAULT 'Medium Risk (Tier 2)', assessment_status TEXT NOT NULL DEFAULT 'Not started', relationship_status TEXT NOT NULL DEFAULT 'Active', next_review DATE, notes TEXT NOT NULL DEFAULT '', risk_register_ids JSONB NOT NULL DEFAULT '[]'::jsonb, questionnaire_id BIGINT REFERENCES tprm_due_diligence_questionnaires(id) ON DELETE SET NULL, due_diligence_assessment JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`); await pool.query("ALTER TABLE tprm_risk_register ADD COLUMN IF NOT EXISTS questionnaire_id BIGINT REFERENCES tprm_due_diligence_questionnaires(id) ON DELETE SET NULL"); await pool.query("ALTER TABLE tprm_risk_register ADD COLUMN IF NOT EXISTS due_diligence_assessment JSONB NOT NULL DEFAULT '{}'::jsonb"); await pool.query("ALTER TABLE tprm_risk_register ADD COLUMN IF NOT EXISTS risk_register_ids JSONB NOT NULL DEFAULT '[]'::jsonb"); await pool.query("ALTER TABLE tprm_risk_register ADD COLUMN IF NOT EXISTS relationship_status TEXT NOT NULL DEFAULT 'Active'"); await pool.query("CREATE TABLE IF NOT EXISTS tprm_related_risks (tprm_id BIGINT NOT NULL REFERENCES tprm_risk_register(id) ON DELETE CASCADE, risk_id TEXT NOT NULL REFERENCES risk_register(risk_id) ON DELETE CASCADE, PRIMARY KEY (tprm_id, risk_id))"); await pool.query("INSERT INTO tprm_related_risks (tprm_id, risk_id) SELECT t.id, selected.risk_id FROM tprm_risk_register t CROSS JOIN LATERAL jsonb_array_elements_text(t.risk_register_ids) AS selected(risk_id) INNER JOIN risk_register risk ON risk.risk_id = selected.risk_id ON CONFLICT DO NOTHING"); }
async function list() { const result = await pool.query("SELECT t.*, t.next_review::text AS next_review, COALESCE(array_agg(r.risk_id) FILTER (WHERE r.risk_id IS NOT NULL), ARRAY[]::text[]) AS relation_ids FROM tprm_risk_register t LEFT JOIN tprm_related_risks r ON r.tprm_id = t.id GROUP BY t.id ORDER BY t.updated_at DESC, t.id DESC"); if(!result.rowCount)return [];
const questionnaires=await pool.query('SELECT * FROM tprm_due_diligence_questionnaires WHERE id=ANY($1::bigint[])',[result.rows.map(row=>row.questionnaire_id).filter(Boolean)]);
const related=await pool.query('SELECT r.*,t.tprm_id FROM risk_register r JOIN tprm_related_risks t ON t.risk_id=r.risk_id WHERE t.tprm_id=ANY($1::bigint[])',[result.rows.map(row=>row.id)]);
return result.rows.map(row=>{
const mapped=map({...row,risk_register_ids:row.relation_ids.length ? row.relation_ids : row.risk_register_ids});
const questionnaire=questionnaires.rows.find(item=>String(item.id)===String(row.questionnaire_id));
const risks=related.rows.filter(item=>String(item.tprm_id)===String(row.id)).map(({tprm_id,...risk})=>risk);
const description=require('./tprmWorkflowService').describe({row:{...mapped,relationship_status:row.relationship_status,next_review:row.next_review},questionnaire,risks});
return {...mapped,riskSummary:description.summary,workflowStage:description.review && !description.reviewed && !['Closed','Offboarding'].includes(description.stage) ? 'Review required' : description.stage,workflowAlerts:description.alerts};
}); }
async function transaction(action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function syncRelatedRisks(tprmId, ids, db = pool) { const requested=[...new Set(riskRegisterIds(ids))]; if(requested.length){const found=await db.query('SELECT risk_id FROM risk_register WHERE risk_id=ANY($1::text[])',[requested]); if(found.rowCount!==requested.length)throw invalid('Selected risk register record does not exist');} await db.query('DELETE FROM tprm_related_risks WHERE tprm_id = $1', [tprmId]); for (const riskId of riskRegisterIds(ids)) await db.query('INSERT INTO tprm_related_risks (tprm_id, risk_id) SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM risk_register WHERE risk_id = $2) ON CONFLICT DO NOTHING', [tprmId, riskId]); }
async function create(data) { return transaction(async client => { data = { ...data, nextReview: '', relationshipStatus: 'Pending', assessmentStatus: 'Not started', dueDiligenceAssessment: workflowRules.cia(data.dueDiligenceAssessment) }; data.riskLevel = workflowRules.cia(data.dueDiligenceAssessment).riskTier || 'Medium Risk (Tier 2)'; const questionnaireId = await validate(data, client); const riskLevel = normalizeRiskLevel(data.riskLevel); const assessmentStatus = normalizeAssessmentStatus(data.assessmentStatus); const relationshipStatus = normalizeRelationshipStatus(data.relationshipStatus); const result = await client.query('INSERT INTO tprm_risk_register (third_party, service_dependency, risk_level, assessment_status, relationship_status, next_review, notes, risk_register_ids, questionnaire_id, due_diligence_assessment) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *, next_review::text AS next_review', [text(data.thirdParty), text(data.serviceDependency), riskLevel, assessmentStatus, relationshipStatus, data.nextReview || null, text(data.notes), JSON.stringify(riskRegisterIds(data.riskRegisterIds)), questionnaireId, data.dueDiligenceAssessment || {}]); await syncRelatedRisks(result.rows[0].id, data.riskRegisterIds, client); return map(result.rows[0]); }); }
async function update(id, data, actor) { return transaction(async client => {
const currentResult = await client.query('SELECT *, next_review::text AS next_review FROM tprm_risk_register WHERE id=$1 FOR UPDATE', [id]);
if (!currentResult.rowCount) throw Object.assign(new Error('TPRM record not found'), {status:404});
const current = currentResult.rows[0];
if (['Offboarded','Terminated'].includes(current.relationship_status)) throw invalid('Hubungan sudah ditutup. Buat record baru untuk hubungan berikutnya.');
if (data.relationshipStatus && data.relationshipStatus !== current.relationship_status) throw invalid('Ubah status hubungan melalui workflow TPRM.');
data = {...data, nextReview: current.next_review ? new Date(current.next_review).toISOString().slice(0,10) : '', relationshipStatus:current.relationship_status, assessmentStatus: 'In progress', dueDiligenceAssessment: data.dueDiligenceAssessment === undefined ? workflowRules.cia(current.due_diligence_assessment) : workflowRules.cia(data.dueDiligenceAssessment)};
if (data.dueDiligenceAssessment.riskScore === undefined) data.assessmentStatus='Not started';
const changed = data.thirdParty !== current.third_party || data.serviceDependency !== current.service_dependency || String(data.questionnaireId) !== String(current.questionnaire_id) || JSON.stringify(data.dueDiligenceAssessment) !== JSON.stringify(workflowRules.cia(current.due_diligence_assessment)) || JSON.stringify(riskRegisterIds(data.riskRegisterIds)) !== JSON.stringify(current.risk_register_ids);
if (!changed) data.assessmentStatus=current.assessment_status;
if (changed) {
const workflow = {...(current.workflow || {}), stage:current.relationship_status === 'Active' ? 'Review required' : 'Draft'};
delete workflow.review; delete workflow.approval;
await client.query('UPDATE tprm_risk_register SET workflow=$1 WHERE id=$2',[JSON.stringify(workflow),id]);
await client.query('INSERT INTO tprm_workflow_events (tprm_id,action,actor,snapshot) VALUES ($1,$2,$3,$4)',[id,'assessment changed',actor?.username || 'system',JSON.stringify({before:current,after:data})]);
}
 data.riskLevel = workflowRules.cia(data.dueDiligenceAssessment).riskTier || 'Medium Risk (Tier 2)'; const questionnaireId = await validate(data, client); const riskLevel = normalizeRiskLevel(data.riskLevel); const assessmentStatus = normalizeAssessmentStatus(data.assessmentStatus); const relationshipStatus = normalizeRelationshipStatus(data.relationshipStatus); const result = await client.query('UPDATE tprm_risk_register SET third_party = $1, service_dependency = $2, risk_level = $3, assessment_status = $4, relationship_status = $5, next_review = $6, notes = $7, risk_register_ids = $8, questionnaire_id = $9, due_diligence_assessment = COALESCE($10::jsonb, due_diligence_assessment), updated_at = NOW() WHERE id = $11 RETURNING *, next_review::text AS next_review', [text(data.thirdParty), text(data.serviceDependency), riskLevel, assessmentStatus, relationshipStatus, data.nextReview || null, text(data.notes), JSON.stringify(riskRegisterIds(data.riskRegisterIds)), questionnaireId, data.dueDiligenceAssessment ? JSON.stringify(data.dueDiligenceAssessment) : null, id]); if (!result.rowCount) throw Object.assign(new Error('TPRM record not found'), { status: 404 }); await syncRelatedRisks(id, data.riskRegisterIds, client); return map(result.rows[0]); }); }
async function remove(id) {
  try {
    const current = await pool.query('SELECT relationship_status, workflow FROM tprm_risk_register WHERE id=$1',[id]);
    if (current.rows[0] && (current.rows[0].relationship_status !== 'Pending' || current.rows[0].workflow?.approval)) throw invalid('Vendor yang sudah aktif atau memiliki keputusan harus ditutup melalui offboarding; riwayat tetap disimpan.');
    const result = await pool.query('DELETE FROM tprm_risk_register WHERE id = $1', [id]);
    if (!result.rowCount) throw Object.assign(new Error('TPRM record not found'), { status: 404 });
  } catch (error) {
    if (['23503', '23001'].includes(error.code)) throw Object.assign(new Error('Vendor masih digunakan oleh aset atau relasi lain. Lepaskan relasi sebelum menghapus vendor.'), { status: 409 });
    throw error;
  }
}
const ensureBaseStore = ensureStore;
module.exports = { ensureStore: async () => { await ensureBaseStore(); await require('./tprmWorkflowService').ensureStore(); }, list, create, update, remove };
