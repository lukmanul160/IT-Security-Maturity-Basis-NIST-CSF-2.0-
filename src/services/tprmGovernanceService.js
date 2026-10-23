// Additional TPRM gates. Policy intervals are organization defaults, not NIST formulas.
const crypto = require('node:crypto');
const rules = require('../shared/tprmWorkflow');
const permissions = require('./permissionService');
const { text, invalid, validDate, futureDate } = rules;
const day = 86400000;
function reviewPolicy(summary, from = rules.today()) {
  const days = summary.tier === 'Tier 1 (Critical)' || summary.residual >= 70 ? 90 : summary.tier === 'Tier 2 (Important)' ? 180 : 365;
  return { days, latestDate: new Date(Date.parse(from) + days * day).toISOString().slice(0,10) };
}
async function eligibleUsers(db) {
  const { rows } = await db.query('SELECT username,full_name,role FROM app_users ORDER BY username');
  const allowed = new Map();
  for (const role of new Set(rows.map(row=>row.role))) allowed.set(role, await permissions.has(role,'tprm-register','update'));
  return rows.filter(row=>allowed.get(row.role)).map(row=>({ username:row.username, name:row.full_name || row.username, role:row.role, requester:true, reviewer:['admin','approver','editor'].includes(row.role), approver:['admin','approver'].includes(row.role) }));
}
async function assignments(input, db) {
  const result = Object.fromEntries(['requester','reviewer','approver'].map(key=>[key,text(input?.[key])]));
  if (Object.values(result).some(value=>!value) || new Set(Object.values(result)).size !== 3) throw invalid('Pengusul, reviewer, dan approver wajib tiga akun berbeda.');
  const users = await eligibleUsers(db);
  for (const key of Object.keys(result)) if (!users.some(user=>user.username===result[key] && user[key])) throw invalid(`Akun ${key} tidak tersedia atau tidak memiliki izin TPRM yang sesuai.`);
  return result;
}
async function requireAssigned(workflow, key, actor, db) {
  const current = await assignments(workflow.assignments, db);
  if (current[key] !== actor.username) throw invalid(`Tindakan ini hanya untuk ${key} yang ditugaskan.`,403);
}
function dependencies(value = []) {
  if (!Array.isArray(value) || value.length>100) throw invalid('Maksimum 100 ketergantungan vendor.');
  const result = value.map(item=>({ name:text(item.name), service:text(item.service), dataLocation:text(item.dataLocation), owner:text(item.owner), exitPlan:text(item.exitPlan), critical:item.critical===true }));
  for (const item of result) if (Object.values(item).some(value=>typeof value==='string' && (!value || value.length>1000))) throw invalid('Isi nama subvendor/provider, layanan, lokasi data, PIC, dan rencana pengganti.');
  if (new Set(result.map(item=>item.name.toLowerCase())).size!==result.length) throw invalid('Nama ketergantungan vendor tidak boleh duplikat.');
  return result;
}
async function vendorEvidence(path, questionnaire, db) {
  if (!(questionnaire?.responses?.vendorDocuments || []).some(file=>file.path===path)) throw invalid('Pilih bukti yang sudah diunggah pada kuesioner vendor ini.');
  const normalized = require('./evidenceAccessService').normalize(path);
  const file = await db.query('SELECT path FROM evidence_files WHERE path=$1 FOR SHARE',[normalized]);
  if (!file.rows.length) throw invalid('Bukti tidak lagi terdaftar di penyimpanan file.');
  return path;
}
function contractDetails(input, summary) {
  const value = { signedDate:text(input?.signedDate), expiresAt:text(input?.expiresAt), evidencePath:text(input?.evidencePath), sla:text(input?.sla), notificationHours:Number(input?.notificationHours), continuityNA:text(input?.continuityNA) };
  if (!validDate(value.signedDate) || value.signedDate>rules.today() || !futureDate(value.expiresAt) || !value.evidencePath || !value.sla || value.sla.length>1000 || !Number.isInteger(value.notificationHours) || value.notificationHours<1 || value.notificationHours>8760) throw invalid('Kontrak wajib memiliki bukti ditandatangani, tanggal tanda tangan, masa berlaku, target SLA, dan tenggat notifikasi insiden (jam).');
  if (summary.tier==='Tier 1 (Critical)' || !value.continuityNA) {
    for (const key of ['rtoHours','rpoHours']) {
      if (input?.[key] === '' || input?.[key] == null || !Number.isFinite(Number(input[key])) || Number(input[key])<0 || Number(input[key])>8760) throw invalid('Isi target RTO dan RPO dalam jam; vendor kritis tidak boleh memakai N/A.');
      value[key] = Number(input[key]);
    }
  }
  return value;
}
function acceptanceValid(row) {
  if (!row || !['temporary','one_year'].includes(row.business_owner_decision) || !['approved','conditional'].includes(row.cis_decision) || !futureDate(row.remediation_date) || (row.cis_decision==='conditional' && !text(row.cis_conditions))) return false;
  return ['requestor','cio','cis'].every(prefix=>text(row[`${prefix}_signature`]) && text(prefix==='requestor'?(row.requestor_print_name || row.requestor_name):row[`${prefix}_name`]) && validDate(row[`${prefix}_date`]) && row[`${prefix}_date`]<=rules.today());
}
function acceptanceHash(row) { return crypto.createHash('sha256').update(rules.stableJson(row)).digest('hex'); }
async function acceptance(id, expiresAt, db) {
  if (!/^[1-9][0-9]{0,18}$/.test(String(id)) || BigInt(id)>9223372036854775807n) throw invalid('Risiko tinggi wajib ditautkan ke Risk Acceptance yang disetujui.');
  const result = await db.query('SELECT *,remediation_date::text AS remediation_date,requestor_date::text AS requestor_date,cio_date::text AS cio_date,cis_date::text AS cis_date FROM risk_acceptance_forms WHERE id=$1 FOR SHARE',[id]);
  const row=result.rows[0];
  if (!acceptanceValid(row) || expiresAt>row.remediation_date) throw invalid('Risk Acceptance belum lengkap, ditolak, kedaluwarsa, atau berakhir sebelum approval TPRM.');
  return { id:String(row.id), title:row.asset_name, expiresAt:row.remediation_date, fingerprint:acceptanceHash(row), conditional:row.cis_decision==='conditional' };
}
async function acceptanceChoices(db, actor) {
  if (!await permissions.has(actor?.role,'risk-acceptance','read')) return [];
  const result=await db.query('SELECT *,remediation_date::text AS remediation_date,requestor_date::text AS requestor_date,cio_date::text AS cio_date,cis_date::text AS cis_date FROM risk_acceptance_forms ORDER BY id DESC');
  return result.rows.filter(acceptanceValid).map(row=>({id:String(row.id),title:row.asset_name,expiresAt:row.remediation_date,conditional:row.cis_decision==='conditional'}));
}
function reminders(row, workflow, summary) {
  const events=[];
  const add=(code,date,message)=>{
    if (!validDate(date)) return;
    const days=Math.round((Date.parse(date)-Date.parse(rules.today()))/day);
    if (days<=30) events.push({code,dueDate:date,days,severity:days<=0?'Overdue':'Due soon',assignee:workflow.assignments?.reviewer || '',escalateTo:days<=0 ? workflow.assignments?.approver || 'admin' : '',message});
  };
  if (row.relationship_status==='Active') {
    add('review',row.next_review,'Review vendor');add('evidence',workflow.evidenceValidUntil,'Masa berlaku evidence');add('approval',workflow.approval?.expiresAt,'Masa berlaku approval');add('contract',workflow.contractDetails?.expiresAt,'Masa berlaku kontrak');
    for (const [index,item] of (workflow.conditions || []).entries()) if(!item.completed)add('mitigation-'+index,item.dueDate,'Mitigasi: '+item.description);
  }
  return { policy:reviewPolicy(summary), reminders:events.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)) };
}
module.exports={reviewPolicy,eligibleUsers,assignments,requireAssigned,dependencies,vendorEvidence,contractDetails,acceptanceValid,acceptance,acceptanceChoices,reminders};
