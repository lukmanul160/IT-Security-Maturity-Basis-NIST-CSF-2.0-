const { pool } = require('../config/database');
const fs = require('fs').promises;
const path = require('path');
const seedDataFile = path.join(__dirname, '../../data/personnel-certifications-seed.json');

const fields = ['domain', 'certification_name', 'issuer', 'reference_url', 'certification_level', 'notes'];
function text(value) { return String(value ?? '').trim(); }
function level(value) { return ['Entry Level', 'Intermediate', 'Advanced / Expert'].includes(value) ? value : 'Intermediate'; }
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
       ON CONFLICT (certification_name) DO UPDATE SET domain = EXCLUDED.domain, issuer = EXCLUDED.issuer, reference_url = EXCLUDED.reference_url, certification_level = EXCLUDED.certification_level, notes = EXCLUDED.notes, updated_at = NOW()`,
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

module.exports = { ensureStore, list };
