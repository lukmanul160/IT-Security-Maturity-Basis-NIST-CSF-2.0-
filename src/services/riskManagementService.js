const fs = require('fs').promises;
const { pool } = require('../config/database');
const { riskIndicatorsData } = require('../config/paths');

const registerFields = ['risk_id', 'third_party', 'risk_category', 'effected_asset', 'device_name', 'identification_risk', 'risk_control', 'risk_cause', 'risk_analysis', 'asset_confidentiality', 'asset_integrity', 'asset_availability', 'asset_value', 'risk_owner', 'note', 'ref', 'likelihood', 'impact', 'risk_rating', 'treatment_action', 'acceptance_form_no', 'risk_treatment_description', 'owner_of_action', 'deadline', 'residual_risk_description', 'residual_likelihood', 'residual_impact', 'residual_rating', 'comment'];
const textFields = registerFields.filter(field => !['asset_confidentiality', 'asset_integrity', 'asset_availability', 'asset_value', 'likelihood', 'impact', 'residual_likelihood', 'residual_impact', 'deadline'].includes(field));
const required = ['riskCategory', 'effectedAsset', 'deviceName', 'identificationRisk', 'likelihood', 'impact'];
const camelFields = registerFields.map(field => field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()));
const dropdownFields = ['riskCategory', 'effectedAsset', 'deviceName', 'riskOwner', 'treatmentAction'];
const defaultDropdowns = { riskCategory: ['Technical', 'Operational'], effectedAsset: ['Laptop User'], deviceName: [], riskOwner: ['All Employee', 'IT Security'], treatmentAction: ['Acceptance', 'Mitigation', 'Transfer', 'Avoidance', 'Closed'] };

function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function cleanText(value) { return String(value ?? '').trim(); }
function numberOrNull(value) { return value === '' || value === null || value === undefined ? null : Number(value); }
function validate(data) {
  if (!data || typeof data !== 'object') throw invalid('Risk data is required');
  required.forEach(field => { if ((field === 'likelihood' || field === 'impact') ? ![1, 2, 3, 4, 5].includes(Number(data[field])) : !cleanText(data[field])) throw invalid(`${field} is required`); });
  ['assetConfidentiality', 'assetIntegrity', 'assetAvailability', 'likelihood', 'impact', 'residualLikelihood', 'residualImpact'].forEach(field => { if (data[field] !== '' && data[field] !== null && data[field] !== undefined && (!Number.isInteger(Number(data[field])) || Number(data[field]) < 1 || Number(data[field]) > 5)) throw invalid(`${field} must be between 1 and 5`); });
  if (data.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(data.deadline)) throw invalid('deadline must be a valid date');
}
function values(data) { return camelFields.map(field => ['assetConfidentiality', 'assetIntegrity', 'assetAvailability', 'assetValue', 'likelihood', 'impact', 'residualLikelihood', 'residualImpact'].includes(field) ? numberOrNull(data[field]) : field === 'deadline' ? data[field] || null : cleanText(data[field])); }
function mapRow(row) { return Object.fromEntries(registerFields.map((field, index) => [camelFields[index], row[field]]).concat([['createdAt', row.created_at], ['updatedAt', row.updated_at]])); }
function rating(likelihood, impact) { const score=Number(likelihood)*Number(impact);return !score?'':score<=4?'Low':score<=12?'Medium':'High'; }
function assetValue(data) { const cia=[data.assetConfidentiality,data.assetIntegrity,data.assetAvailability].map(Number);return cia.every(value=>Number.isInteger(value)&&value>=1&&value<=5)?Math.max(...cia):null; }
function normalizeAssessment(data){
 if(!data||typeof data!=='object')throw invalid('Risk data is required');
 const impact=assetValue(data);
 const supplied=[data.assetConfidentiality,data.assetIntegrity,data.assetAvailability].some(value=>value!==null&&value!==undefined&&value!=='');
 if(supplied&&impact===null)throw invalid('Isi seluruh nilai Confidentiality, Integrity, Availability (1-5).');
 if(impact!==null){const assessment=require('./assetRiskAssessmentService').assess({confidentiality:Number(data.assetConfidentiality),integrity:Number(data.assetIntegrity),availability:Number(data.assetAvailability),likelihood:Number(data.likelihood)});return {...data,impact:assessment.impact,assetValue:assessment.impact};}
 return data;
}

async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS risk_indicators (id BIGSERIAL PRIMARY KEY, indicator_type TEXT NOT NULL, score INTEGER, label TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', details JSONB NOT NULL DEFAULT '{}'::jsonb, sort_order INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS risk_register (risk_id TEXT PRIMARY KEY, risk_category TEXT NOT NULL, effected_asset TEXT NOT NULL, device_name TEXT NOT NULL DEFAULT '', identification_risk TEXT NOT NULL, risk_control TEXT NOT NULL DEFAULT '', risk_cause TEXT NOT NULL DEFAULT '', risk_analysis TEXT NOT NULL DEFAULT '', asset_confidentiality INTEGER, asset_integrity INTEGER, asset_availability INTEGER, asset_value INTEGER, risk_owner TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', likelihood INTEGER NOT NULL, impact INTEGER NOT NULL, risk_rating TEXT NOT NULL DEFAULT '', treatment_action TEXT NOT NULL DEFAULT '', acceptance_form_no TEXT NOT NULL DEFAULT '', risk_treatment_description TEXT NOT NULL DEFAULT '', owner_of_action TEXT NOT NULL DEFAULT '', deadline DATE, residual_risk_description TEXT NOT NULL DEFAULT '', residual_likelihood INTEGER, residual_impact INTEGER, residual_rating TEXT NOT NULL DEFAULT '', comment TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query("ALTER TABLE risk_register ADD COLUMN IF NOT EXISTS device_name TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE risk_register ADD COLUMN IF NOT EXISTS third_party TEXT NOT NULL DEFAULT ''");
  await pool.query(`CREATE TABLE IF NOT EXISTS risk_dropdown_options (id BIGSERIAL PRIMARY KEY, field_name TEXT NOT NULL, option_value TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT risk_dropdown_option_unique UNIQUE (field_name, option_value))`);
  await refreshCalculatedValues();
  const indicatorCount = await pool.query('SELECT COUNT(*)::int AS count FROM risk_indicators');
  if (!indicatorCount.rows[0].count) await seedIndicators();
}
async function refreshCalculatedValues() {
 await pool.query(`UPDATE risk_register SET asset_value=CASE WHEN asset_confidentiality BETWEEN 1 AND 5 AND asset_integrity BETWEEN 1 AND 5 AND asset_availability BETWEEN 1 AND 5 THEN GREATEST(asset_confidentiality,asset_integrity,asset_availability) ELSE NULL END,impact=CASE WHEN asset_confidentiality BETWEEN 1 AND 5 AND asset_integrity BETWEEN 1 AND 5 AND asset_availability BETWEEN 1 AND 5 THEN GREATEST(asset_confidentiality,asset_integrity,asset_availability) ELSE impact END`);
 await pool.query(`UPDATE risk_register SET risk_rating=CASE WHEN likelihood*impact<=4 THEN 'Low' WHEN likelihood*impact<=12 THEN 'Medium' ELSE 'High' END,residual_rating=CASE WHEN residual_likelihood IS NULL OR residual_impact IS NULL THEN '' WHEN residual_likelihood*residual_impact<=4 THEN 'Low' WHEN residual_likelihood*residual_impact<=12 THEN 'Medium' ELSE 'High' END`);
}
async function seedIndicators() { const indicators = JSON.parse(await fs.readFile(riskIndicatorsData, 'utf8')); for (const indicator of indicators) await pool.query('INSERT INTO risk_indicators (indicator_type, score, label, description, sort_order) VALUES ($1, $2, $3, $4, $5)', [indicator.indicatorType, numberOrNull(indicator.score), cleanText(indicator.label), cleanText(indicator.description), Number(indicator.sortOrder || 0)]); }
async function listIndicators() { const result = await pool.query('SELECT * FROM risk_indicators ORDER BY indicator_type, sort_order, id'); return result.rows; }
async function syncDropdownValues(data) { for (const field of dropdownFields) if (cleanText(data[field])) await pool.query('INSERT INTO risk_dropdown_options (field_name, option_value) VALUES ($1, $2) ON CONFLICT (field_name, option_value) DO NOTHING', [field, cleanText(data[field])]); }
async function listDropdowns() { const result = await pool.query(`SELECT COALESCE(MIN(NULLIF(id, 0)), 0) AS id, field_name AS "fieldName", option_value AS "optionValue", MIN(sort_order) AS "sortOrder" FROM (SELECT id, field_name, option_value, sort_order FROM risk_dropdown_options UNION SELECT 0, 'riskCategory', risk_category, 999 FROM risk_register WHERE risk_category <> '' UNION SELECT 0, 'effectedAsset', effected_asset, 999 FROM risk_register WHERE effected_asset <> '' UNION SELECT 0, 'deviceName', device_name, 999 FROM risk_register WHERE device_name <> '' UNION SELECT 0, 'riskOwner', risk_owner, 999 FROM risk_register WHERE risk_owner <> '' UNION SELECT 0, 'treatmentAction', treatment_action, 999 FROM risk_register WHERE treatment_action <> '') options GROUP BY field_name, option_value ORDER BY field_name, MIN(sort_order), option_value`); return result.rows; }
function validateDropdown(data) {
  if (!data || !dropdownFields.includes(data.fieldName) || !cleanText(data.optionValue) || cleanText(data.optionValue).length > 200) throw invalid('Jenis pilihan dan nama pilihan wajib diisi (maksimal 200 karakter).');
  if (!Number.isSafeInteger(Number(data.sortOrder || 0)) || Number(data.sortOrder || 0) < 0 || Number(data.sortOrder || 0) > 2147483647) throw invalid('Urutan harus berupa bilangan bulat positif atau nol.');
}
function dropdownFailure(error) { if (error.code === '23505') return Object.assign(new Error('Pilihan dengan nama yang sama sudah tersedia untuk jenis ini.'), { status: 409 }); return error; }
async function createDropdown(data) {
  validateDropdown(data);
  try { const result = await pool.query('INSERT INTO risk_dropdown_options (field_name, option_value, sort_order) VALUES ($1, $2, $3) RETURNING id, field_name AS "fieldName", option_value AS "optionValue", sort_order AS "sortOrder"', [data.fieldName, cleanText(data.optionValue), Number(data.sortOrder || 0)]); return result.rows[0]; }
  catch (error) { throw dropdownFailure(error); }
}
async function getDropdown(id) {
  const result = await pool.query('SELECT * FROM risk_dropdown_options WHERE id = $1', [id]);
  if (!result.rowCount) throw Object.assign(new Error('Pilihan tidak ditemukan.'), { status: 404 });
  return result.rows[0];
}
async function dropdownInUse(row) {
  const column = { riskCategory: 'risk_category', effectedAsset: 'effected_asset', deviceName: 'device_name', riskOwner: 'risk_owner', treatmentAction: 'treatment_action' }[row.field_name];
  if (!column) throw invalid('Jenis pilihan tidak valid.');
  const result = await pool.query(`SELECT 1 FROM risk_register WHERE ${column} = $1 LIMIT 1`, [row.option_value]);
  return Boolean(result.rowCount);
}
async function updateDropdown(id, data) {
  validateDropdown(data); const previous = await getDropdown(id);
  if ((previous.field_name !== data.fieldName || previous.option_value !== cleanText(data.optionValue)) && await dropdownInUse(previous)) throw Object.assign(new Error('Pilihan sedang digunakan pada risk register. Nama dan jenis tidak dapat diubah; urutan tetap dapat diperbarui.'), { status: 409 });
  try { const result = await pool.query('UPDATE risk_dropdown_options SET field_name = $1, option_value = $2, sort_order = $3, updated_at = NOW() WHERE id = $4 RETURNING id, field_name AS "fieldName", option_value AS "optionValue", sort_order AS "sortOrder"', [data.fieldName, cleanText(data.optionValue), Number(data.sortOrder || 0), id]); if (!result.rowCount) throw Object.assign(new Error('Pilihan tidak ditemukan.'), { status: 404 }); return result.rows[0]; }
  catch (error) { throw dropdownFailure(error); }
}
async function removeDropdown(id) {
  const previous = await getDropdown(id);
  if (await dropdownInUse(previous)) throw Object.assign(new Error('Pilihan sedang digunakan pada risk register dan tidak dapat dihapus.'), { status: 409 });
  const result = await pool.query('DELETE FROM risk_dropdown_options WHERE id = $1', [id]); if (!result.rowCount) throw Object.assign(new Error('Pilihan tidak ditemukan.'), { status: 404 });
}
async function createIndicator(data) { if (!cleanText(data.label) || !cleanText(data.indicatorType)) throw invalid('indicatorType and label are required'); const result = await pool.query('INSERT INTO risk_indicators (indicator_type, score, label, description, sort_order) VALUES ($1, $2, $3, $4, $5) RETURNING *', [data.indicatorType, numberOrNull(data.score), cleanText(data.label), cleanText(data.description), Number(data.sortOrder || 0)]); return result.rows[0]; }
async function updateIndicator(id, data) { const result = await pool.query('UPDATE risk_indicators SET indicator_type = $1, score = $2, label = $3, description = $4, sort_order = $5, updated_at = NOW() WHERE id = $6 RETURNING *', [data.indicatorType, numberOrNull(data.score), cleanText(data.label), cleanText(data.description), Number(data.sortOrder || 0), id]); if (!result.rowCount) throw Object.assign(new Error('Indicator not found'), { status: 404 }); return result.rows[0]; }
async function removeIndicator(id) { const result = await pool.query('DELETE FROM risk_indicators WHERE id = $1', [id]); if (!result.rowCount) throw Object.assign(new Error('Indicator not found'), { status: 404 }); }
async function listRegister() { const result = await pool.query(`SELECT ${registerFields.join(', ')}, created_at, updated_at FROM risk_register ORDER BY updated_at DESC`); return result.rows.map(mapRow); }
async function create(data) { data=normalizeAssessment(data);validate(data); const normalized = { ...data, riskId: await nextRiskId(), assetValue: assetValue(data), riskRating: rating(data.likelihood, data.impact), residualRating: rating(data.residualLikelihood, data.residualImpact) }; const result = await pool.query(`INSERT INTO risk_register (${registerFields.join(', ')}) VALUES (${registerFields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`, values(normalized)); await syncDropdownValues(normalized); return mapRow(result.rows[0]); }
async function update(id, data) { data=normalizeAssessment(data);validate(data); const normalized = { ...data, assetValue: assetValue(data), riskRating: rating(data.likelihood, data.impact), residualRating: rating(data.residualLikelihood, data.residualImpact) }; const assignments = registerFields.slice(1).map((field, index) => `${field} = $${index + 1}`).join(', '); const result = await pool.query(`UPDATE risk_register SET ${assignments}, updated_at = NOW() WHERE risk_id = $${registerFields.length} RETURNING *`, [...values(normalized).slice(1), id]); if (!result.rowCount) throw Object.assign(new Error('Risk not found'), { status: 404 }); await syncDropdownValues(normalized); return mapRow(result.rows[0]); }
async function remove(id) { const result = await pool.query('DELETE FROM risk_register WHERE risk_id = $1', [id]); if (!result.rowCount) throw Object.assign(new Error('Risk not found'), { status: 404 }); await pool.query(`UPDATE tprm_risk_register SET risk_register_ids = COALESCE((SELECT jsonb_agg(risk_id) FROM jsonb_array_elements_text(risk_register_ids) AS selected(risk_id) WHERE selected.risk_id <> $1), '[]'::jsonb), updated_at = NOW() WHERE risk_register_ids @> jsonb_build_array($1::text)`, [id]); }
async function resetRegister() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM risk_register');
    await client.query('DELETE FROM risk_dropdown_options');
    await client.query("UPDATE tprm_risk_register SET risk_register_ids = '[]'::jsonb, updated_at = NOW()");
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function nextRiskId() { const result = await pool.query("SELECT COALESCE(MAX(NULLIF(regexp_replace(risk_id, '[^0-9]', '', 'g'), '')::int), 0) + 1 AS next_id FROM risk_register"); return `CSR - ${String(result.rows[0].next_id).padStart(3, '0')}`; }
async function dashboard() { const risks = await listRegister(); const today = new Date().toISOString().slice(0, 10); return { total: risks.length, ratings: risks.reduce((out, row) => { out[row.riskRating || 'Unrated'] = (out[row.riskRating || 'Unrated'] || 0) + 1; return out; }, {}), treatments: risks.reduce((out, row) => { const key = row.treatmentAction || 'Unassigned'; out[key] = (out[key] || 0) + 1; return out; }, {}), overdue: risks.filter(row => row.deadline && String(row.deadline).slice(0, 10) < today).length, highResidual: risks.filter(row => ['High', 'Very High'].includes(row.residualRating)).length }; }
module.exports = { ensureStore, listIndicators, createIndicator, updateIndicator, removeIndicator, listDropdowns, createDropdown, updateDropdown, removeDropdown, listRegister, create, update, remove, resetRegister, dashboard };
