const { pool } = require('../config/database');
const rules = require('./riskWorkflowRules');
const permissions = require('./permissionService');
const crypto = require('node:crypto');
const protectedFields = ['threat', 'vulnerability', 'likelihoodRationale', 'impactRationale', 'currentLikelihood', 'currentImpact', 'targetLikelihood', 'targetImpact', 'toleranceScore', 'toleranceRationale', 'approver', 'reviewer', 'acceptanceReason', 'acceptanceConditions', 'acceptanceExpiry', 'acceptanceFormId'];
const riskFields = ['risk_category', 'effected_asset', 'device_name', 'identification_risk', 'risk_control', 'risk_cause', 'risk_analysis', 'risk_owner', 'likelihood', 'impact', 'treatment_action', 'risk_treatment_description', 'owner_of_action', 'deadline', 'residual_likelihood', 'residual_impact'];
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const assessmentHash = row => hash(riskFields.map(key => row[key] instanceof Date ? row[key].toISOString().slice(0, 10) : row[key] ?? null));
const camel = row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), value instanceof Date ? value.toISOString().slice(0, 10) : value]));
async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS risk_workflows (risk_id TEXT PRIMARY KEY REFERENCES risk_register(risk_id) ON DELETE CASCADE, data JSONB NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS risk_workflow_events (id BIGSERIAL PRIMARY KEY, risk_id TEXT NOT NULL REFERENCES risk_register(risk_id) ON DELETE CASCADE, actor TEXT NOT NULL, action TEXT NOT NULL, reason TEXT NOT NULL, snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query('CREATE INDEX IF NOT EXISTS risk_workflow_events_risk_idx ON risk_workflow_events (risk_id, id DESC)');
}
async function users() {
  const rows = (await pool.query('SELECT username, role FROM app_users ORDER BY username')).rows;
  const out = [];
  for (const row of rows) if (await permissions.has(row.role, 'risk-management', 'update')) out.push({ ...row, canApprove: ['admin', 'approver'].includes(row.role) });
  return out;
}
async function checkUser(client, username, approve = false) {
  const row = (await client.query('SELECT username, role FROM app_users WHERE username = $1', [username])).rows[0];
  if (!row || (approve && !['admin', 'approver'].includes(row.role)) || !(await permissions.has(row.role, 'risk-management', 'update'))) rules.fail('Akun reviewer/approver tidak memiliki kewenangan yang diperlukan.');
}
async function acceptance(client, id) {
  const row = (await client.query('SELECT * FROM risk_acceptance_forms WHERE id = $1', [id])).rows[0];
  if (!row) rules.fail('Form Risk Acceptance tidak ditemukan.');
  if (!['temporary', 'one_year'].includes(row.business_owner_decision) || !['approved', 'conditional'].includes(row.cis_decision)) rules.fail('Form Risk Acceptance belum disetujui atau ditolak.');
  for (const key of ['requestor_signature', 'requestor_date', 'cio_name', 'cio_signature', 'cio_date', 'cis_name', 'cis_signature', 'cis_date']) if (!row[key]) rules.fail('Pengesahan pada form Risk Acceptance belum lengkap.');
  return hash(row);
}
async function decorate(client, risk, workflow) {
  const data = { ...rules.initial(), ...workflow, version: workflow.version ?? 0 };
  data.reviewRequired = ['Monitoring', 'Accepted'].includes(data.stage) && (!data.reviewDate || data.reviewDate <= rules.today());
  data.expired = data.stage === 'Accepted' && (!data.acceptanceExpiry || data.acceptanceExpiry <= rules.today());
  data.assessmentChanged = Boolean(data.assessmentSnapshot && data.assessmentSnapshot !== assessmentHash(risk));
  if (['Accepted', 'Pending Approval'].includes(data.stage) && data.acceptanceSnapshot) {
    try { data.acceptanceChanged = data.acceptanceSnapshot !== await acceptance(client, data.acceptanceFormId); }
    catch { data.acceptanceChanged = true; }
  }
  data.effectiveStage = data.expired || data.assessmentChanged || data.acceptanceChanged ? 'Review Required' : data.stage;
  data.isActiveAcceptance = data.stage === 'Accepted' && data.effectiveStage === 'Accepted' && !data.reviewRequired;
  return data;
}
async function get(id) {
  const risk = (await pool.query('SELECT * FROM risk_register WHERE risk_id = $1', [id])).rows[0];
  if (!risk) rules.fail('Risk tidak ditemukan.', 404);
  const row = (await pool.query('SELECT data, version FROM risk_workflows WHERE risk_id = $1', [id])).rows[0];
  const data = await decorate(pool, risk, { ...(row?.data || {}), version: row?.version || 0 });
  const history = (await pool.query('SELECT id, actor, action, reason, snapshot, created_at AS "createdAt" FROM risk_workflow_events WHERE risk_id = $1 ORDER BY id DESC', [id])).rows;
  return { ...data, history };
}
async function mutate(id, input, actor, action) {
  if (!actor?.username) rules.fail('Autentikasi diperlukan.', 403);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const risk = (await client.query('SELECT * FROM risk_register WHERE risk_id = $1 FOR UPDATE', [id])).rows[0];
    if (!risk) rules.fail('Risk tidak ditemukan.', 404);
    const stored = (await client.query('SELECT data, version FROM risk_workflows WHERE risk_id = $1 FOR UPDATE', [id])).rows[0];
    const previous = { ...rules.initial(), ...(stored?.data || {}), version: stored?.version || 0 };
    if (Number(input.version) !== previous.version || input.version == null) rules.fail('Workflow berubah. Refresh sebelum menyimpan.', 409);
    let data;
    if (action === 'save') {
      if (previous.stage === 'Closed') rules.fail('Buka reassessment sebelum mengedit risiko Closed.', 409);
      data = { ...previous, ...rules.sanitize(input) };
      if (data.approver) await checkUser(client, data.approver, true);
      if (data.reviewer) await checkUser(client, data.reviewer);
      const changed = protectedFields.some(key => (data[key] ?? '') !== (previous[key] ?? ''));
      if (changed && previous.stage !== 'Draft') { data.stage = 'Draft'; data.approvedBy = null; data.verifiedBy = null; data.acceptanceSnapshot = null; }
      if (previous.stage === 'Accepted' && !changed && data.reviewDate !== previous.reviewDate && data.reviewDate > data.acceptanceExpiry) rules.fail('Review tidak boleh melewati expiry acceptance.');
    } else {
      const effective = await decorate(client, risk, previous);
      if ((effective.assessmentChanged || effective.expired || effective.acceptanceChanged) && !['reassess', 'requestClosure', 'close', 'reject'].includes(action)) rules.fail('Risiko/form berubah atau acceptance kedaluwarsa. Lakukan reassessment.', 409);
      if (action === 'submit') { await checkUser(client, previous.approver, true); await checkUser(client, previous.reviewer); }
      if (['approve', 'reject', 'close'].includes(action)) await checkUser(client, actor.username, true);
      if (action === 'verify') await checkUser(client, actor.username);
      if (action === 'submit' && camel(risk).treatmentAction === 'Acceptance') previous.acceptanceSnapshot = await acceptance(client, previous.acceptanceFormId);
      data = rules.transition(previous, camel(risk), action, actor, input.reason);
      data.assessmentSnapshot = assessmentHash(risk);
    }
    data.version = previous.version + 1;
    delete data.history;
    await client.query(`INSERT INTO risk_workflows (risk_id, data, version) VALUES ($1, $2::jsonb, $3) ON CONFLICT (risk_id) DO UPDATE SET data = EXCLUDED.data, version = EXCLUDED.version, updated_at = NOW()`, [id, JSON.stringify(data), data.version]);
    await client.query('INSERT INTO risk_workflow_events (risk_id, actor, action, reason, snapshot) VALUES ($1,$2,$3,$4,$5::jsonb)', [id, actor.username, action, String(input.reason || 'Perubahan data workflow').slice(0, 10000), JSON.stringify({ ...data, assessment: camel(risk) })]);
    await client.query('COMMIT');
    return get(id);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function invalidateRegister(client, id, actor, before, after) {
  if (assessmentHash(before) === assessmentHash(after)) return;
  const row = (await client.query('SELECT data, version FROM risk_workflows WHERE risk_id = $1 FOR UPDATE', [id])).rows[0];
  if (!row) return;
  if (row.data.stage === 'Closed') rules.fail('Lakukan Assessment ulang sebelum mengubah data risiko Closed.', 409);
  const onlyResidual = riskFields.filter(key => !key.startsWith('residual_')).every(key => String(before[key] ?? '') === String(after[key] ?? ''));
  const residualUpdate = row.data.stage === 'Pending Verification' && onlyResidual;
  const data = residualUpdate ? { ...row.data, assessmentSnapshot: assessmentHash(after), version: row.version + 1 } : { ...row.data, stage: 'Draft', approvedBy: null, verifiedBy: null, acceptanceSnapshot: null, assessmentSnapshot: null, version: row.version + 1 };
  await client.query('UPDATE risk_workflows SET data=$2::jsonb, version=$3, updated_at=NOW() WHERE risk_id=$1', [id, JSON.stringify(data), data.version]);
  await client.query('INSERT INTO risk_workflow_events (risk_id,actor,action,reason,snapshot) VALUES ($1,$2,$3,$4,$5::jsonb)', [id, actor?.username || 'system', residualUpdate ? 'residualUpdated' : 'assessmentChanged', residualUpdate ? 'Residual aktual dicatat untuk verifikasi.' : 'Data register berubah; assessment dan approval perlu diulang.', JSON.stringify({ ...data, assessment: camel(after) })]);
}
module.exports = { ensureStore, users, get, mutate, invalidateRegister, decorate };
