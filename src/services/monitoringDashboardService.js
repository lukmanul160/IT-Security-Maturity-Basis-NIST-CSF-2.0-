const { pool } = require('../config/database');
const permissions = require('./permissionService');

const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const todayInBangkok = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(now);
function distribution(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const label = String(typeof field === 'function' ? field(row) : row[field] || 'Belum diisi');
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}
function deadlines(rows, field, today, active = () => true) {
  let overdue = 0, upcoming = 0;
  const limit = new Date(today + 'T00:00:00Z'); limit.setUTCDate(limit.getUTCDate() + 30);
  const end = limit.toISOString().slice(0, 10);
  for (const row of rows.filter(active)) {
    const due = day(typeof field === 'function' ? field(row) : row[field]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) continue;
    if (due < today) overdue++;
    else if (due <= end) upcoming++;
  }
  return { overdue, upcoming };
}
function recordTrend(rows, now) {
  const month = todayInBangkok(now).slice(0, 7);
  const anchor = new Date(month + '-01T00:00:00Z');
  const points = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(anchor); date.setUTCMonth(date.getUTCMonth() - 5 + index);
    return { label: date.toISOString().slice(0, 7), value: 0 };
  });
  for (const row of rows) {
    const date = new Date(row.created_at);
    if (!Number.isFinite(date.getTime())) continue;
    const point = points.find(p => p.label === todayInBangkok(date).slice(0, 7));
    if (point) point.value++;
  }
  return points;
}
const metric = (label, value) => ({ label, value });
const query = async (sql, args = []) => (await pool.query(sql, args)).rows;

async function snapshot(user, now = new Date()) {
  const access = await permissions.getRoleActions(user.role);
  const can = key => Boolean(access[key]?.read);
  const today = todayInBangkok(now), modules = [], tasks = [];
  function add(id, title, group, view, load, allowed = can(id)) {
    if (!allowed) return;
    tasks.push(async () => {
      const base = { id, title, group, view };
      try { return { ...base, state: 'ready', ...(await load()) }; }
      catch (error) {
        console.error('[monitoring] Module unavailable:', id, error.code || error.name);
        return { ...base, state: 'unavailable', total: null, metrics: [], distribution: [], trend: [] };
      }
    });
  }
  const summarize = (rows, field, extra = {}) => ({ total: rows.length, distribution: field ? distribution(rows, field) : [], trend: recordTrend(rows, now), metrics: [], ...extra });
  for (const [id, title, assessmentKey, stateId, maximum] of [
    ['csf', 'NIST CSF 2.0', 'assessment', 'default', 4],
    ['privacy', 'Privacy Framework', 'privacy-assessment', 'privacy', 5]
  ]) add(id, title, 'governance', id, async () => {
    const rows = await query('SELECT code,category FROM controls WHERE framework_id=$1', [id]);
    if (!can(assessmentKey)) return summarize(rows, 'category', { unit: 'Kontrol', trend: [] });
    const state = await require('./assessmentService').getAssessment(stateId);
    const scores = [], policy = state.policyScores || state.scores || {}, practice = state.practiceScores || state.scores || {};
    let assessed = 0;
    for (const row of rows) {
      const valid = [policy[row.code], practice[row.code]].filter(v => typeof v === 'number' && Number.isFinite(v) && v >= (maximum === 4 ? 0 : 1) && v <= maximum);
      if (valid.length === 2) assessed++;
      scores.push(...valid);
    }
    return { total: rows.length, unit: 'Kontrol', progress: rows.length ? Math.round(assessed / rows.length * 100) : 0,
      distribution: [{ label: 'Sudah dinilai', value: assessed }, { label: 'Belum lengkap', value: rows.length - assessed }], trend: [],
      metrics: [metric('Maturity rata-rata', scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null), metric('Skala maksimum', maximum)] };
  });
  add('framework', 'Choose framework', 'governance', 'framework', async () => summarize(await query('SELECT id FROM frameworks'), null, { unit: 'Framework', trend: [] }));
  for (const [id, title] of [['iso27001', 'ISO 27001:2022'], ['iso27001-soa', 'Statement of Applicability']]) add(id, title, 'governance', id, async () => {
    const rows = await query('SELECT implementation,applicability,evidence FROM controls WHERE framework_id=$1', [id]);
    const documented = rows.filter(r => r.implementation?.trim()).length;
    return summarize(rows, r => r.implementation?.trim() ? 'Implementasi dicatat' : 'Belum dicatat', { unit: 'Kontrol', trend: [], progress: rows.length ? Math.round(documented / rows.length * 100) : 0,
      metrics: [metric('Dengan evidence', rows.filter(r => Array.isArray(r.evidence) && r.evidence.length).length), ...(id.endsWith('soa') ? [metric('Not applicable', rows.filter(r => r.applicability === 'Not applicable').length)] : [])] });
  });
  add('iso-objectives', 'Information Security Objectives', 'governance', 'iso27001', async () => {
    const rows = await query('SELECT annual_status,created_at FROM information_security_objectives WHERE objective_year=$1', [Number(today.slice(0, 4))]);
    return summarize(rows, 'annual_status', { unit: 'Sasaran tahun berjalan' });
  }, can('iso27001'));
  add('risk-management', 'Risk Management', 'risk', 'risk-management', async () => {
    const rows = await query('SELECT risk_rating,treatment_action,deadline::text AS deadline,created_at FROM risk_register');
    return summarize(rows, 'risk_rating', { unit: 'Risiko', ...deadlines(rows, 'deadline', today), metrics: [metric('High / Very High', rows.filter(r => ['High', 'Very High'].includes(r.risk_rating)).length)] });
  });
  add('risk-acceptance', 'Risk Acceptance', 'risk', 'risk-acceptance', async () => {
    const rows = await query('SELECT cis_decision,remediation_date::text AS remediation_date,created_at FROM risk_acceptance_forms');
    return summarize(rows, 'cis_decision', { unit: 'Form', ...deadlines(rows, 'remediation_date', today, r => r.cis_decision !== 'denied') });
  });
  add('audit-finding-tracker', 'Audit Finding Tracker', 'risk', 'audit-finding-tracker', async () => {
    const rows = await query("SELECT kind,data->>'status' AS status,data->>'dueDate' AS due_date,created_at FROM audit_finding_records");
    const findings = rows.filter(r => r.kind === 'finding');
    return summarize(findings, 'status', { unit: 'Temuan', ...deadlines(findings, 'due_date', today, r => r.status !== 'Closed'), metrics: [metric('Audit', rows.filter(r => r.kind === 'audit').length), metric('Tindak lanjut', rows.filter(r => r.kind === 'followup').length)] });
  });
  add('threat-modelling', 'Threat Modelling', 'risk', 'threat-modelling', async () => {
    const rows = await query("SELECT created_at, (SELECT COALESCE(jsonb_agg(threat), '[]'::jsonb) FROM jsonb_array_elements(COALESCE(diagram->'nodes','[]'::jsonb) || COALESCE(diagram->'edges','[]'::jsonb)) element CROSS JOIN LATERAL jsonb_array_elements(COALESCE(element->'threats','[]'::jsonb)) threat) AS threats FROM threat_models");
    const threats = rows.flatMap(r => r.threats);
    return summarize(rows, null, { unit: 'Diagram', distribution: distribution(threats, 'status'), metrics: [metric('Ancaman STRIDE', threats.length), metric('Ancaman terbuka', threats.filter(r => r.status === 'Open').length)] });
  });
  add('policy-register', 'Policy Register', 'governance', 'policy-register', async () => {
    const rows = await query('SELECT approval_status,last_review::text AS last_review,review_cycle,created_at FROM policy_register');
    return summarize(rows, 'approval_status', { unit: 'Kebijakan', ...deadlines(rows, require('./policyReminderService').nextReview, today) });
  });
  add('asset-register', 'Asset Register', 'assets', 'asset-register', async () => {
    const rows = await query("SELECT data->>'status' AS status,data->>'renewalDate' AS renewal_date,data#>>'{assetAssessment,level}' AS risk,created_at FROM managed_assets");
    return summarize(rows, 'status', { unit: 'Aset', ...deadlines(rows, 'renewal_date', today, r => !['retired', 'disposed'].includes(r.status)), metrics: [metric('Risiko CIA tinggi', rows.filter(r => r.risk === 'high').length)] });
  });
  add('server-racks', 'Rak Server', 'assets', 'server-racks', async () => {
    const rows = await query('SELECT r.id,r.units,COUNT(d.asset_id)::int AS devices FROM asset_racks r LEFT JOIN asset_rack_devices d ON d.rack_id=r.id GROUP BY r.id');
    const used = (await query('SELECT COUNT(DISTINCT (p.rack_id,u))::int AS count FROM asset_rack_devices p CROSS JOIN LATERAL generate_series(p.start_unit,p.start_unit+p.height-1) u'))[0]?.count || 0;
    const capacity = rows.reduce((sum, r) => sum + r.units, 0);
    return { total: rows.length, unit: 'Rak', progress: capacity ? Math.round(used / capacity * 100) : 0, trend: [], distribution: [{ label: 'U terpakai', value: used }, { label: 'U tersedia', value: Math.max(0, capacity - used) }], metrics: [metric('Perangkat terpasang', rows.reduce((sum, r) => sum + r.devices, 0)), metric('Kapasitas U', capacity)] };
  });
  add('asset-modelling', 'Modelling Asset Register', 'assets', 'asset-modelling', async () => {
    await require('./assetDiagramService').ensureStore();
    const rows = await query('SELECT type FROM asset_relations');
    const canvases = (await query('SELECT COUNT(*)::int AS count FROM asset_diagram_canvases'))[0].count + 1;
    return summarize(rows, 'type', { unit: 'Relasi', trend: [], metrics: [metric('Canvas', canvases)] });
  });
  add('personnel-certification', 'Personnel Certification', 'people', 'personnel-certification', async () => {
    const rows = await query('SELECT status,expiry_date::text AS expiry_date,created_at FROM personnel_certifications');
    const personnel = (await query('SELECT COUNT(*)::int AS count FROM organization_personnel'))[0].count;
    return summarize(rows, 'status', { unit: 'Sertifikasi', ...deadlines(rows, 'expiry_date', today), metrics: [metric('Personel', personnel)] });
  });
  add('tprm-register', 'TPRM Risk Register', 'vendors', 'tprm-register', async () => {
    const rows = await query('SELECT risk_level,relationship_status,next_review::text AS next_review,created_at FROM tprm_risk_register');
    return summarize(rows, 'risk_level', { unit: 'Vendor', ...deadlines(rows, 'next_review', today, r => r.relationship_status === 'Active'), metrics: [metric('Vendor aktif', rows.filter(r => r.relationship_status === 'Active').length)] });
  });
  add('tprm-questionnaire', 'Due Diligence Questionnaire', 'vendors', 'tprm-questionnaire', async () => {
    const rows = await query('SELECT assessment_status,review_date::text AS review_date,created_at FROM tprm_due_diligence_questionnaires');
    return summarize(rows, 'assessment_status', { unit: 'Assessment', ...deadlines(rows, 'review_date', today) });
  });
  add('questionnaire-templates', 'Questionnaire Templates', 'vendors', 'questionnaire-templates', async () => summarize(await query('SELECT is_default,created_at FROM questionnaire_templates'), r => r.is_default ? 'Bawaan' : 'Kustom', { unit: 'Template' }));
  for (const [id, title] of [['tprm', 'TPRM Framework'], ['tprm-tiering', 'Vendor Tiering Matrix']]) add(id, title, 'vendors', id, async () => ({ total: null, unit: 'Referensi proses', metrics: [], distribution: [], trend: [], reference: true }));
  add('knowledge-notes', 'Knowledge Notes', 'knowledge', 'knowledge-notes', async () => summarize(await query('SELECT folder FROM knowledge_notes'), r => r.folder?.split('/')[0] || 'Root', { unit: 'Catatan', trend: [] }));
  add('files', 'Uploaded files', 'knowledge', 'files', async () => {
    const rows = await require('./evidenceAccessService').list(user);
    return summarize(rows, 'source', { unit: 'File', trend: [], ownOnly: user.role !== 'admin' });
  });
  if (user.role === 'admin') {
    add('account', 'Account Management', 'system', 'account', async () => summarize(await query('SELECT role,created_at FROM app_users'), 'role', { unit: 'Akun' }));
    add('audit-events', 'Audit Trail', 'system', 'account', async () => {
      const rows = await query("SELECT CASE WHEN status_code >= 400 THEN 'Gagal' ELSE 'Berhasil' END AS result, COUNT(*)::int AS count FROM audit_events WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY result");
      return { total: rows.reduce((sum, r) => sum + r.count, 0), unit: 'Event 30 hari', metrics: [], distribution: rows.map(r => ({ label: r.result, value: r.count })), trend: [] };
    }, true);
    for (const [id, title, service, method] of [['backups', 'Database Backup', 'backupService', 'listBackups'], ['file-backups', 'File Backup', 'fileBackupService', 'list']]) add(id, title, 'system', id, async () => {
      const rows = await require('./' + service)[method]();
      return { total: rows.length, unit: 'Backup', metrics: [metric('Ukuran MB', Number((rows.reduce((sum, r) => sum + r.size, 0) / 1048576).toFixed(1)))], distribution: [], trend: [], lastBackup: rows[0]?.createdAt || null };
    }, true);
    add('smtp', 'SMTP Settings', 'system', 'account', async () => {
      const rows = await query("SELECT CASE WHEN COALESCE(settings->>'host','') <> '' THEN 'Dikonfigurasi' ELSE 'Belum dikonfigurasi' END AS status FROM app_smtp_settings UNION ALL SELECT CASE WHEN COALESCE(settings->>'host','') <> '' THEN 'Dikonfigurasi' ELSE 'Belum dikonfigurasi' END FROM app_smtp_accounts");
      return summarize(rows, 'status', { unit: 'Konfigurasi SMTP', trend: [] });
    }, true);
    add('storage', 'File Storage', 'system', 'account', async () => summarize(await query('SELECT mode FROM file_storage_settings'), 'mode', { unit: 'Konfigurasi storage', trend: [] }), true);
  }
  // Bound parallel work so a dashboard refresh does not monopolize the database pool.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, tasks.length) }, async () => {
    while (cursor < tasks.length) { const index = cursor++; modules[index] = await tasks[index](); }
  }));
  return { generatedAt: now.toISOString(), timezone: 'Asia/Bangkok', modules };
}
module.exports = { snapshot, distribution, deadlines, recordTrend, todayInBangkok };
