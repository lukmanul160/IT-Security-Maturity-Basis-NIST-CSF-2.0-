const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/database');
const { dataRoot } = require('../config/paths');

function validate(data, partial = false) {
  const fields = ['id', 'function', 'category', 'subcategory', 'implementation', 'references'];
  if (!partial && fields.some(field => typeof data[field] !== 'string' || !data[field].trim())) throw Object.assign(new Error('All CSF fields are required'), { status: 400 });
  if (partial && fields.slice(1).some(field => data[field] !== undefined && typeof data[field] !== 'string')) throw Object.assign(new Error('Invalid CSF field'), { status: 400 });
}

async function getAll() { const result = await pool.query('SELECT id, function, category, subcategory, implementation, "references" FROM csf_controls ORDER BY id'); return result.rows; }
async function create(data) { validate(data); const result = await pool.query('INSERT INTO csf_controls (id, function, category, subcategory, implementation, "references") VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [data.id, data.function, data.category, data.subcategory, data.implementation, data.references]); return result.rows[0]; }
async function update(id, data) { validate(data, true); const fields = ['function', 'category', 'subcategory', 'implementation', '"references"']; const values = fields.filter(field => data[field.replaceAll('"', '')] !== undefined); if (!values.length) throw Object.assign(new Error('No fields to update'), { status: 400 }); const params = values.map(field => data[field.replaceAll('"', '')]); const assignments = values.map((field, index) => `${field} = $${index + 1}`).join(', '); params.push(id); const result = await pool.query(`UPDATE csf_controls SET ${assignments}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params); if (!result.rowCount) throw Object.assign(new Error('CSF control not found'), { status: 404 }); return result.rows[0]; }
async function remove(id) { const result = await pool.query('DELETE FROM csf_controls WHERE id = $1', [id]); if (!result.rowCount) throw Object.assign(new Error('CSF control not found'), { status: 404 }); }
async function initialize() { const count = await pool.query('SELECT COUNT(*)::int AS count FROM csf_controls'); if (count.rows[0].count) return; const seed = JSON.parse(await fs.readFile(path.join(dataRoot, 'csf-data.json'), 'utf8')); for (const row of seed) await create(row); }

module.exports = { getAll, create, update, remove, initialize };
