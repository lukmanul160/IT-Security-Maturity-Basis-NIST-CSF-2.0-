const { pool } = require('../config/database');
const fs = require('fs').promises;
const path = require('path');
const seedDataFile = path.join(__dirname, '../../data/personnel-certifications-seed.json');

const fields = ['domain', 'certification_name', 'issuer', 'reference_url', 'certification_level', 'notes'];
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function text(value) { return String(value ?? '').trim(); }
function level(value) { return ['Entry Level', 'Intermediate', 'Advanced / Expert'].includes(value) ? value : 'Intermediate'; }
function validate(data) { if (!data || !text(data.domain) || !text(data.certificationName)) throw invalid('domain and certificationName are required'); if (text(data.referenceUrl) && !/^https?:\/\//i.test(text(data.referenceUrl))) throw invalid('referenceUrl must use http or https'); }
function values(data) { return [text(data.domain), text(data.certificationName), text(data.issuer), text(data.referenceUrl), level(data.certificationLevel), text(data.notes)]; }
function map(row) { return { id: row.id, domain: row.domain, certificationName: row.certification_name, issuer: row.issuer, referenceUrl: row.reference_url, certificationLevel: level(row.certification_level), notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at }; }

async function seedCatalogFromData() {
  const payload = JSON.parse(await fs.readFile(seedDataFile, 'utf8'));
  if (!Array.isArray(payload.records)) throw new Error('Certification roadmap catalog seed records are invalid');
  const names = new Set();
  for (const record of payload.records) {
    if (!text(record.certificationName) || names.has(record.certificationName) || !['Entry Level', 'Intermediate', 'Advanced / Expert'].includes(record.certificationLevel)) {
      throw new Error('Certification roadmap catalog seed contains an invalid or duplicate record');
    }
    names.add(record.certificationName);
    const data = [text(record.personnelRole), text(record.certificationName), text(record.issuer), text(record.referenceUrl), level(record.certificationLevel), text(record.notes)];
    await pool.query(
      `INSERT INTO certification_roadmap_catalog (${fields.join(', ')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')})
       ON CONFLICT (certification_name) DO NOTHING`,
      data
    );
  }
}

async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS certification_roadmap_catalog (id BIGSERIAL PRIMARY KEY, domain TEXT NOT NULL DEFAULT '', certification_name TEXT NOT NULL, issuer TEXT NOT NULL DEFAULT '', reference_url TEXT NOT NULL DEFAULT '', certification_level TEXT NOT NULL DEFAULT 'Intermediate', notes TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT certification_roadmap_catalog_unique UNIQUE (certification_name))`);
  await seedCatalogFromData();
}

async function list() {
  const result = await pool.query('SELECT * FROM certification_roadmap_catalog ORDER BY domain, certification_level, certification_name');
  return result.rows.map(map);
}

async function create(data) { validate(data); const result = await pool.query(`INSERT INTO certification_roadmap_catalog (${fields.join(', ')}) VALUES (${fields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`, values(data)); return map(result.rows[0]); }
async function update(id, data) { validate(data); const assignments = fields.map((field, index) => `${field} = $${index + 1}`).join(', '); const result = await pool.query(`UPDATE certification_roadmap_catalog SET ${assignments}, updated_at = NOW() WHERE id = $${fields.length + 1} RETURNING *`, [...values(data), id]); if (!result.rowCount) throw Object.assign(new Error('Catalog item not found'), { status: 404 }); return map(result.rows[0]); }
async function remove(id) { const result = await pool.query('DELETE FROM certification_roadmap_catalog WHERE id = $1', [id]); if (!result.rowCount) throw Object.assign(new Error('Catalog item not found'), { status: 404 }); }

module.exports = { ensureStore, list, create, update, remove };
