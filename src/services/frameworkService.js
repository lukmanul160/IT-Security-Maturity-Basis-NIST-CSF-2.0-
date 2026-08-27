const fs = require('fs').promises;
const XLSX = require('xlsx');
const { pool } = require('../config/database');
const { dataRoot, privacyWorkbook, privacyData } = require('../config/paths');

function duplicateIdError(frameworkId, code) {
  const label = frameworkId === 'csf' ? 'CSF' : frameworkId === 'privacy' ? 'Privacy' : frameworkId;
  return Object.assign(new Error(`${label} control ID already exists: ${code}`), { status: 409 });
}

async function ensureFramework(framework) {
  const result = await pool.query('SELECT id FROM frameworks WHERE id = $1', [framework.id]);
  if (!result.rowCount) {
    await pool.query('INSERT INTO frameworks (id, name, version, description) VALUES ($1, $2, $3, $4)', [framework.id, framework.name, framework.version, framework.description || '']);
  }
}

async function listFrameworks() {
  const result = await pool.query('SELECT id, name, version, description FROM frameworks ORDER BY name');
  return result.rows;
}

async function createFramework(data) {
  if (!data || typeof data.id !== 'string' || !data.id.trim() || typeof data.name !== 'string' || !data.name.trim() || typeof data.version !== 'string' || !data.version.trim()) throw Object.assign(new Error('Framework id, name, and version are required'), { status: 400 });
  const result = await pool.query('INSERT INTO frameworks (id, name, version, description) VALUES ($1, $2, $3, $4) RETURNING id, name, version, description', [data.id.trim(), data.name.trim(), data.version.trim(), typeof data.description === 'string' ? data.description : '']);
  return result.rows[0];
}

async function getControls(frameworkId) {
  const result = await pool.query('SELECT code AS id, function, category, subcategory, implementation, "references" FROM controls WHERE framework_id = $1 ORDER BY code', [frameworkId]);
  return result.rows;
}

async function createControl(frameworkId, data) {
  const existing = await pool.query('SELECT 1 FROM controls WHERE framework_id = $1 AND code = $2', [frameworkId, data.id]);
  if (existing.rowCount) throw duplicateIdError(frameworkId, data.id);
  const result = await pool.query('INSERT INTO controls (framework_id, code, function, category, subcategory, implementation, "references") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING code AS id, function, category, subcategory, implementation, "references"', [frameworkId, data.id, data.function, data.category, data.subcategory, data.implementation || '', data.references || '']);
  return result.rows[0];
}

async function updateControl(frameworkId, code, data) {
  const fields = ['function', 'category', 'subcategory', 'implementation', '"references"'].filter(field => data[field.replaceAll('"', '')] !== undefined);
  if (!fields.length) throw Object.assign(new Error('No fields to update'), { status: 400 });
  const params = fields.map(field => data[field.replaceAll('"', '')]);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
  params.push(frameworkId, code);
  const result = await pool.query(`UPDATE controls SET ${assignments}, updated_at = NOW() WHERE framework_id = $${params.length - 1} AND code = $${params.length} RETURNING code AS id, function, category, subcategory, implementation, "references"`, params);
  if (!result.rowCount) throw Object.assign(new Error('Control not found'), { status: 404 });
  return result.rows[0];
}

async function deleteControl(frameworkId, code) {
  const result = await pool.query('DELETE FROM controls WHERE framework_id = $1 AND code = $2', [frameworkId, code]);
  if (!result.rowCount) throw Object.assign(new Error('Control not found'), { status: 404 });
}

function readPrivacyCore() {
  let workbook;
  try { workbook = XLSX.readFile(privacyWorkbook); } catch (error) { if (error.code === 'ENOENT') return JSON.parse(require('fs').readFileSync(privacyData, 'utf8')); throw error; }
  const sheet = workbook.Sheets['Privacy Framework Core'];
  if (!sheet) return [];
  let currentFunction = '';
  let currentCategory = '';
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).slice(3).map(row => {
    if (String(row[1]).trim()) currentFunction = String(row[1]).trim();
    if (String(row[3]).trim()) currentCategory = String(row[3]).trim();
    const subcategory = String(row[5] || '').trim();
    if (!/^([A-Z]{2})\.([A-Z]{2})-P\d+:/.test(subcategory)) return null;
    return { id: subcategory.split(':')[0], function: currentFunction, category: currentCategory, subcategory };
  }).filter(Boolean);
}

async function initializeFrameworks() {
  await ensureFramework({ id: 'csf', name: 'NIST Cybersecurity Framework', version: '2.0', description: 'NIST CSF 2.0 controls' });
  await ensureFramework({ id: 'privacy', name: 'NIST Privacy Framework', version: '1.0', description: 'NIST Privacy Framework controls' });
  const csfCount = await pool.query('SELECT COUNT(*)::int AS count FROM controls WHERE framework_id = $1', ['csf']);
  if (!csfCount.rows[0].count) {
    const seed = JSON.parse(await fs.readFile(`${dataRoot}/csf-data.json`, 'utf8'));
    for (const row of seed) await createControl('csf', row);
  }
  const privacyCount = await pool.query('SELECT COUNT(*)::int AS count FROM controls WHERE framework_id = $1', ['privacy']);
  if (!privacyCount.rows[0].count) {
    for (const row of readPrivacyCore()) await createControl('privacy', row);
  }
}

module.exports = { listFrameworks, createFramework, getControls, createControl, updateControl, deleteControl, initializeFrameworks };
