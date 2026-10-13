const crypto = require('node:crypto');

const ciaFields = {
  vendor: ['dataAccess', 'dataProtection', 'accessManagement', 'securityCertification', 'secureSdlc', 'auditTrail', 'slaUptime', 'businessContinuity', 'operationalImpact'],
  device: ['encryption', 'access', 'sensitiveData', 'endpointProtection', 'patchManagement', 'userAccess', 'backup', 'mdm', 'operationalRole']
};
const criticalControls = ['access', 'encryption', 'incident', 'continuity'];
const contractControls = ['security', 'incident', 'audit', 'subprocessors', 'dataExit'];
const exitControls = ['accessRevoked', 'dataResolved', 'obligationsResolved'];
const ratingScores = { 'Very Low': 10, Low: 25, Medium: 50, High: 75, 'Very High': 100 };
function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
function text(value) { return String(value ?? '').trim(); }
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
function today() { return new Date().toISOString().slice(0, 10); }
function futureDate(value) { return validDate(value) && value > today(); }
function cia(source = {}) {
  const fields = ciaFields[source.assessmentType || 'vendor'];
  if (!fields || !fields.every(key => Number.isInteger(Number(source[key])) && Number(source[key]) >= 1 && Number(source[key]) <= 5)) return {};
  const result = Object.fromEntries(fields.map(key => [key, Number(source[key])]));
  const averages = [0, 3, 6].map(index => fields.slice(index, index + 3).reduce((sum, key) => sum + result[key], 0) / 3);
  const riskScore = Math.round(averages.reduce((sum, value) => sum + value, 0) / 15 * 100);
  return { ...result, assessmentType: source.assessmentType || 'vendor', confidentiality: averages[0], integrity: averages[1], availability: averages[2], riskScore, riskTier: riskScore <= 40 ? 'High Risk (Tier 1)' : riskScore <= 70 ? 'Medium Risk (Tier 2)' : 'Low Risk (Tier 3)' };
}
function questionnaireScore(responses = {}) {
  const fields = ['piiExposure', 'securityMaturity', 'financial', 'reputation'];
  if (!fields.every(key => Number.isInteger(Number(responses[key])) && Number(responses[key]) >= 1 && Number(responses[key]) <= 5)) return { riskScore: null, riskTier: 'Not assessed' };
  const score = fields.reduce((sum, key, index) => sum + Number(responses[key]) * [40, 30, 10, 20][index], 0);
  return { riskScore: score, riskTier: score <= 200 ? 'Tier 1 (High)' : score <= 350 ? 'Tier 2 (Medium)' : 'Tier 3 (Low)' };
}
function questionnaireReadiness(responses = {}) {
  const sections = responses.questionnaireSections || [];
  let total = 0, answered = 0;
  for (const [title, questions] of sections) for (let index = 0; index < questions.length; index++) {
    total++;
    const key = `${title}-${index}`;
    if (['Yes', 'No', 'N/A'].includes(responses[`${key}-decision`]) && text(responses[key])) answered++;
  }
  const documents = Array.isArray(responses.vendorDocuments) ? responses.vendorDocuments.filter(file => text(file.path)) : [];
  const score = questionnaireScore(responses);
  return { total, answered, documents: documents.length, complete: total > 0 && answered === total && documents.length > 0 && score.riskScore !== null };
}
function profileTier(profile = {}) {
  const keys = ['dataSensitivity', 'systemAccess', 'businessImpact', 'replaceability'];
  if (!text(profile.owner) || !keys.every(key => [1, 2, 3].includes(Number(profile[key])))) return null;
  const value = Math.max(...keys.map(key => Number(profile[key])));
  return value === 3 ? 'Tier 1 (Critical)' : value === 2 ? 'Tier 2 (Important)' : 'Tier 3 (Standard)';
}
function riskLevel(score) { return score === null ? 'Not assessed' : score >= 70 ? 'High Risk' : score >= 40 ? 'Medium Risk' : 'Low Risk'; }
function riskSummary(row, questionnaire, risks = []) {
  const assessment = cia(row.dueDiligenceAssessment);
  const readiness = questionnaireReadiness(questionnaire?.responses);
  const tier = profileTier(row.workflow?.profile);
  const complete = Boolean(tier && readiness.complete && assessment.riskScore !== undefined);
  if (!complete) return { complete: false, tier: tier || 'Not classified', inherent: null, residual: null, level: 'Incomplete', readiness };
  const base = 100 - assessment.riskScore;
  const inherent = Math.max(base, ...risks.map(risk => ratingScores[risk.risk_rating ?? risk.riskRating] ?? 100));
  // Residual risk cannot be inferred from the inherent rating or an absent control assessment.
  const residual = risks.length ? risks.every(risk => ratingScores[risk.residual_rating ?? risk.residualRating] !== undefined) ? Math.max(...risks.map(risk => ratingScores[risk.residual_rating ?? risk.residualRating])) : null : text(row.workflow?.noRisksReason) ? base : null;
  return { complete, tier, inherent, residual, level: riskLevel(residual), readiness };
}
function fingerprint(row, questionnaire, risks) {
  return crypto.createHash('sha256').update(stableJson({ vendor: row.thirdParty, service: row.serviceDependency, questionnaireId: row.questionnaireId, profile: row.workflow?.profile, noRisksReason: row.workflow?.noRisksReason, cia: cia(row.dueDiligenceAssessment), questionnaire: questionnaire?.responses, risks: [...risks].sort((a, b) => String(a.risk_id ?? a.riskId).localeCompare(String(b.risk_id ?? b.riskId))) })).digest('hex');
}
function stableJson(value) {
  const normalize = item => item instanceof Date ? item.toISOString() : Array.isArray(item) ? item.map(normalize) : item && typeof item === 'object' ? Object.fromEntries(Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => [key, normalize(item[key])])) : item;
  return JSON.stringify(normalize(value));
}
function checkCritical(controls) {
  return criticalControls.every(key => ['Pass', 'N/A'].includes(controls?.[key]?.status) && text(controls[key].notes));
}
module.exports = { ciaFields, cia, questionnaireScore, questionnaireReadiness, profileTier, riskSummary, fingerprint, stableJson, riskLevel, criticalControls, contractControls, exitControls, checkCritical, validDate, futureDate, today, text, invalid };
