const { pool } = require('../config/database');
const rules = require('../shared/tprmWorkflow');
const { text, invalid, futureDate, validDate } = rules;

async function ensureStore() {
  await pool.query("ALTER TABLE tprm_risk_register ADD COLUMN IF NOT EXISTS workflow JSONB NOT NULL DEFAULT '{}'::jsonb");
  await pool.query(`CREATE TABLE IF NOT EXISTS tprm_workflow_events (id BIGSERIAL PRIMARY KEY, tprm_id BIGINT NOT NULL REFERENCES tprm_risk_register(id) ON DELETE CASCADE, action TEXT NOT NULL, actor TEXT NOT NULL, snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}
function record(row) {
  return { ...row, thirdParty: row.third_party, serviceDependency: row.service_dependency, questionnaireId: row.questionnaire_id, dueDiligenceAssessment: row.due_diligence_assessment || {}, workflow: row.workflow || {} };
}
async function context(id, db = pool, lock = false) {
  const result = await db.query(`SELECT *, next_review::text AS next_review FROM tprm_risk_register WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [id]);
  if (!result.rowCount) throw invalid('TPRM record not found', 404);
  const row = record(result.rows[0]);
  const questionnaire = await db.query(`SELECT *, review_date::text AS review_date FROM tprm_due_diligence_questionnaires WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [row.questionnaireId]);
  const risks = await db.query(`SELECT r.* FROM risk_register r JOIN tprm_related_risks t ON t.risk_id=r.risk_id WHERE t.tprm_id=$1 ORDER BY r.risk_id${lock ? ' FOR SHARE OF r' : ''}`, [id]);
  return { row, questionnaire: questionnaire.rows[0], risks: risks.rows };
}
function describe({ row, questionnaire, risks }) {
  const summary = rules.riskSummary(row, questionnaire, risks);
  const fingerprint = rules.fingerprint(row, questionnaire, risks);
  const workflow = row.workflow;
  const reviewed = workflow.review?.fingerprint === fingerprint;
  const approved = reviewed && workflow.approval?.fingerprint === fingerprint && ['Approved', 'Approved with Conditions'].includes(workflow.approval?.decision);
  const alerts = [];
  if (!summary.complete) alerts.push('Assessment belum lengkap: profil kritikalitas, semua jawaban, bukti, dan CIA wajib diisi.');
  if (summary.complete && summary.residual === null) alerts.push('Residual risk belum lengkap. Lengkapi risiko terkait atau jelaskan hasil identifikasi tanpa gap.');
  if (workflow.review && !reviewed) alerts.push('Data assessment berubah. Review dan approval sebelumnya perlu diperbarui.');
  if (row.relationship_status === 'Active' && (!approved || !workflow.activatedAt)) alerts.push('Vendor aktif memerlukan validasi workflow sebelum approval baru.');
  if (row.relationship_status === 'Active' && (!row.next_review || new Date(row.next_review).toISOString().slice(0, 10) <= rules.today())) alerts.push('Review vendor perlu dijadwalkan atau sudah jatuh tempo.');
  if (workflow.evidenceValidUntil && !futureDate(workflow.evidenceValidUntil)) alerts.push('Masa berlaku bukti berakhir; lakukan review ulang.');
  if (workflow.approval?.expiresAt && !futureDate(workflow.approval.expiresAt)) alerts.push('Persetujuan risiko kedaluwarsa; lakukan review ulang.');
  if ((workflow.conditions || []).some(condition => !condition.completed && condition.dueDate <= rules.today())) alerts.push('Ada tindakan mitigasi melewati tenggat.');
  return { ...workflow, stage: workflow.stage || 'Draft', summary, reviewed, approved, alerts, relationshipStatus: row.relationship_status, nextReview: row.next_review };
}
async function get(id) {
  const data = await context(id);
  const history = await pool.query('SELECT id, action, actor, created_at, snapshot FROM tprm_workflow_events WHERE tprm_id=$1 ORDER BY id DESC', [id]);
  const revisions = await pool.query('SELECT id, actor, created_at, snapshot FROM tprm_questionnaire_history WHERE questionnaire_id=$1 ORDER BY id DESC', [data.row.questionnaireId]);
  return { ...describe(data), history: history.rows, questionnaireHistory: revisions.rows };
}
function conditions(value = []) {
  if (!Array.isArray(value) || value.length > 100) throw invalid('Invalid mitigation actions');
  return value.map(item => {
    if (!text(item.description) || !text(item.owner) || !validDate(item.dueDate)) throw invalid('Setiap mitigasi wajib memiliki tindakan, PIC, dan tenggat valid.');
    if (item.completed && !text(item.evidence)) throw invalid('Mitigasi selesai wajib memiliki keterangan bukti verifikasi.');
    return { description: text(item.description), owner: text(item.owner), dueDate: item.dueDate, preActivation: item.preActivation !== false, completed: item.completed === true, evidence: text(item.evidence) };
  });
}
function requireReviewer(actor) {
  if (!['admin', 'approver', 'editor'].includes(actor?.role)) throw invalid('Review hanya dapat dilakukan admin, approver, atau editor.', 403);
}
function requireApprover(actor) {
  if (!['admin', 'approver'].includes(actor?.role)) throw invalid('Keputusan hanya dapat dilakukan admin atau approver.', 403);
}
async function act(id, input, actor) {
  if (!text(actor?.username)) throw invalid('Authenticated user is required', 403);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const data = await context(id, client, true);
    const { row, questionnaire, risks } = data;
    const workflow = structuredClone(row.workflow);
    const action = input.action;
    let relationship = row.relationship_status || 'Pending';
    let nextReview = row.next_review ? new Date(row.next_review).toISOString().slice(0, 10) : '';
    if (workflow.review && workflow.review.fingerprint !== rules.fingerprint(row, questionnaire, risks) && !['Offboarding', 'Closed'].includes(workflow.stage)) {
      workflow.stage = 'Review required'; delete workflow.review; delete workflow.approval;
    }
    let stage = workflow.stage || 'Draft';
    const terminal = ['Offboarded', 'Terminated'].includes(relationship);
    if (terminal) throw invalid('Hubungan sudah ditutup. Buat record baru untuk hubungan berikutnya.');
    const enforceStage = allowed => { if (!allowed.includes(stage)) throw invalid(`Action ${action} tidak tersedia pada tahap ${stage}.`); };
    if (action === 'save') {
      enforceStage(['Draft', 'Incomplete', 'Changes requested', 'Mitigation', 'Review required', 'Active', 'Approved', 'Rejected']);
      workflow.profile = { owner: text(input.profile?.owner), dataSensitivity: Number(input.profile?.dataSensitivity), systemAccess: Number(input.profile?.systemAccess), businessImpact: Number(input.profile?.businessImpact), replaceability: Number(input.profile?.replaceability), scope: text(input.profile?.scope) };
      workflow.noRisksReason = text(input.noRisksReason);
      workflow.conditions = conditions(input.conditions);
      workflow.stage = relationship === 'Active' ? 'Review required' : 'Draft';
      delete workflow.review; delete workflow.approval;
    } else if (action === 'submit') {
      enforceStage(['Draft', 'Incomplete', 'Changes requested', 'Mitigation', 'Review required', 'Rejected']);
      const summary = rules.riskSummary(row, questionnaire, risks);
      if (!summary.complete || summary.residual === null) throw invalid('Lengkapi profil kritikalitas, kuesioner, bukti, CIA, serta residual risk sebelum submit.');
      workflow.stage = 'Under review'; delete workflow.review; delete workflow.approval;
    } else if (action === 'return') {
      requireReviewer(actor); enforceStage(['Under review', 'Validated', 'Mitigation']);
      if (!text(input.notes)) throw invalid('Alasan pengembalian wajib diisi.');
      workflow.stage = 'Changes requested'; workflow.returnReason = text(input.notes); delete workflow.review; delete workflow.approval;
    } else if (action === 'review') {
      requireReviewer(actor); enforceStage(['Under review', 'Mitigation']);
      const summary = rules.riskSummary(row, questionnaire, risks);
      if (!summary.complete || summary.residual === null) throw invalid('Assessment dan residual risk belum lengkap.');
      if (input.evidenceVerified !== true || !text(input.notes) || !futureDate(input.evidenceValidUntil)) throw invalid('Verifikasi bukti, catatan reviewer, dan masa berlaku bukti di masa depan wajib diisi.');
      const controls = {};
      for (const key of rules.criticalControls) {
        const value = input.criticalControls?.[key];
        if (!['Pass', 'Fail', 'N/A'].includes(value?.status) || !text(value.notes)) throw invalid('Semua kontrol kritis wajib dinilai dengan keterangan bukti atau alasan N/A.');
        controls[key] = { status: value.status, notes: text(value.notes) };
      }
      workflow.criticalControls = controls;
      workflow.conditions = conditions(input.conditions);
      if (!rules.checkCritical(controls) && !workflow.conditions.some(item => !item.completed)) throw invalid('Kegagalan kontrol kritis wajib memiliki rencana mitigasi terbuka.');
      workflow.evidenceValidUntil = input.evidenceValidUntil;
      workflow.review = { by: actor.username, at: new Date().toISOString(), notes: text(input.notes), fingerprint: rules.fingerprint(row, questionnaire, risks) };
      workflow.stage = rules.checkCritical(controls) ? 'Validated' : 'Mitigation';
      delete workflow.approval;
    } else if (action === 'approve') {
      requireApprover(actor); enforceStage(['Validated', 'Mitigation']);
      const summary = rules.riskSummary(row, questionnaire, risks);
      const fingerprint = rules.fingerprint(row, questionnaire, risks);
      if (!workflow.review || workflow.review.fingerprint !== fingerprint) throw invalid('Review tidak berlaku. Data berubah atau belum divalidasi.');
      if (workflow.review.by === actor.username) throw invalid('Approver harus berbeda dari reviewer.', 403);
      if (!['Approved', 'Approved with Conditions', 'Rejected'].includes(input.decision) || !text(input.notes)) throw invalid('Keputusan dan alasan approval wajib diisi.');
      if (input.decision !== 'Rejected') {
        if (!summary.complete || summary.residual === null || !rules.checkCritical(workflow.criticalControls)) throw invalid('Kontrol kritis harus lulus dan residual risk harus lengkap sebelum approval.');
        if (!futureDate(workflow.evidenceValidUntil)) throw invalid('Bukti kedaluwarsa; review ulang diperlukan.');
        if (!futureDate(input.expiresAt)) throw invalid('Masa berlaku approval wajib diisi dengan tanggal di masa depan.');
        if (summary.residual >= 70 && !text(input.riskAcceptance)) throw invalid('Risiko tinggi memerlukan alasan penerimaan risiko.');
        const open = (workflow.conditions || []).filter(item => !item.completed);
        if (input.decision === 'Approved' && open.length) throw invalid('Mitigasi terbuka memerlukan Approved with Conditions.');
        if (input.decision === 'Approved with Conditions' && (!open.length || !text(input.accessLimits) || open.some(item => item.dueDate <= rules.today()))) throw invalid('Approval bersyarat memerlukan tindakan terbuka, tenggat mendatang, dan batas akses.');
      }
      workflow.approval = { decision: input.decision, by: actor.username, at: new Date().toISOString(), notes: text(input.notes), expiresAt: input.decision === 'Rejected' ? '' : input.expiresAt, riskAcceptance: text(input.riskAcceptance), accessLimits: text(input.accessLimits), fingerprint };
      workflow.stage = input.decision === 'Rejected' ? 'Rejected' : 'Approved';
      await client.query("UPDATE tprm_due_diligence_questionnaires SET assessment_status='Final', assessment_result=$1, reviewer=$2, updated_at=NOW() WHERE id=$3", [input.decision, workflow.review.by, row.questionnaireId]);
    } else if (action === 'activate') {
      enforceStage(['Approved']);
      const fingerprint = rules.fingerprint(row, questionnaire, risks);
      if (!workflow.approval || workflow.approval.fingerprint !== fingerprint || !rules.checkCritical(workflow.criticalControls) || !futureDate(workflow.approval.expiresAt) || !futureDate(workflow.evidenceValidUntil)) throw invalid('Approval atau bukti tidak berlaku. Review ulang diperlukan.');
      const actions = conditions(input.conditions);
      if (JSON.stringify(actions.map(item => [item.description,item.owner,item.dueDate,item.preActivation])) !== JSON.stringify((workflow.conditions || []).map(item => [item.description,item.owner,item.dueDate,item.preActivation]))) throw invalid('Perubahan rencana mitigasi memerlukan review dan approval ulang.');
      if (actions.some(item => item.preActivation && !item.completed)) throw invalid('Selesaikan syarat sebelum aktivasi dan isi bukti verifikasinya.');
      if (actions.some(item => !item.completed && item.dueDate <= rules.today())) throw invalid('Tenggat mitigasi telah berakhir.');
      if (!rules.contractControls.every(key => input.contract?.[key] === true) || !text(input.contractReference)) throw invalid('Semua persyaratan kontrak dan referensi kontrak wajib diverifikasi.');
      if (!futureDate(input.nextReview) || input.nextReview > workflow.approval.expiresAt || input.nextReview > workflow.evidenceValidUntil) throw invalid('Review berikutnya harus di masa depan, paling lambat masa berlaku approval dan bukti.');
      workflow.conditions = actions; workflow.contract = input.contract; workflow.contractReference = text(input.contractReference);
      workflow.stage = 'Active'; workflow.activatedAt = new Date().toISOString(); relationship = 'Active'; nextReview = input.nextReview;
    } else if (action === 'monitor') {
      if (relationship !== 'Active') throw invalid('Monitoring hanya untuk vendor aktif.');
      if (!text(input.notes)) throw invalid('Catatan monitoring wajib diisi.');
      const actions = conditions(input.conditions);
      if (JSON.stringify(actions.map(item => [item.description,item.owner,item.dueDate,item.preActivation])) !== JSON.stringify((workflow.conditions || []).map(item => [item.description,item.owner,item.dueDate,item.preActivation]))) throw invalid('Perubahan rencana mitigasi memerlukan review ulang.');
      if (actions.some((item, index) => workflow.conditions[index].completed && !item.completed)) throw invalid('Mitigasi yang dibuka kembali memerlukan review ulang.');
      workflow.conditions = actions; workflow.lastMonitoring = { by: actor.username, at: new Date().toISOString(), notes: text(input.notes) };
    } else if (action === 'reassess') {
      if (relationship !== 'Active' && !['Approved', 'Rejected', 'Validated', 'Mitigation'].includes(stage)) throw invalid('Review ulang belum tersedia.');
      if (!text(input.notes)) throw invalid('Alasan review ulang wajib diisi.');
      workflow.stage = 'Review required'; workflow.reviewReason = text(input.notes); delete workflow.review; delete workflow.approval;
      await client.query("UPDATE tprm_due_diligence_questionnaires SET assessment_status='In progress', assessment_result='Pending', updated_at=NOW() WHERE id=$1", [row.questionnaireId]);
    } else if (action === 'startOffboarding') {
      if (!['Active', 'Expired', 'Pending'].includes(relationship)) throw invalid('Offboarding sudah berjalan atau hubungan ditutup.');
      if (!text(input.notes)) throw invalid('Alasan penutupan hubungan wajib diisi.');
      workflow.stage = 'Offboarding'; workflow.exitReason = text(input.notes); relationship = 'Offboarding';
    } else if (action === 'close') {
      requireReviewer(actor); enforceStage(['Offboarding']);
      if (!rules.exitControls.every(key => input.exitChecklist?.[key] === true) || !text(input.notes) || !text(input.exitEvidencePath)) throw invalid('Checklist penutupan, catatan, dan dokumen bukti wajib diisi.');
      if (!(questionnaire?.responses?.vendorDocuments || []).some(file => file.path === input.exitEvidencePath)) throw invalid('Bukti penutupan harus dipilih dari dokumen vendor yang sudah diunggah.');
      if (!['Offboarded', 'Terminated'].includes(input.relationshipStatus)) throw invalid('Pilih Offboarded atau Terminated.');
      workflow.exit = { checklist: input.exitChecklist, evidencePath: input.exitEvidencePath, notes: text(input.notes), by: actor.username, at: new Date().toISOString() };
      workflow.stage = 'Closed'; relationship = input.relationshipStatus; nextReview = '';
    } else throw invalid('Unknown workflow action');
    const updated = { ...row, workflow };
    const summary = rules.riskSummary(updated, questionnaire, risks);
    const status = ['Validated', 'Approved', 'Active'].includes(workflow.stage) && summary.complete ? 'Complete' : summary.complete ? 'In progress' : 'Not started';
    await client.query('UPDATE tprm_risk_register SET workflow=$1, relationship_status=$2, next_review=$3, assessment_status=$4, updated_at=NOW() WHERE id=$5', [JSON.stringify(workflow), relationship, nextReview || null, status, id]);
    await client.query('INSERT INTO tprm_workflow_events (tprm_id, action, actor, snapshot) VALUES ($1,$2,$3,$4)', [id, action, actor.username, JSON.stringify({ record: { ...updated, relationship_status: relationship, next_review: nextReview }, questionnaire, risks, summary })]);
    await client.query('COMMIT');
    return get(id);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
module.exports = { ensureStore, context, describe, get, act };
