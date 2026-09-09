const { pool } = require('../config/database');
const fs = require('node:fs/promises');
const path = require('node:path');

const fields = ['personnel_name', 'employee_id', 'personnel_role', 'supervisor_name', 'certification_name', 'issuer', 'reference_url', 'certification_level', 'status', 'issue_date', 'expiry_date', 'notes', 'on_canvas', 'position_x', 'position_y', 'card_width', 'card_height'];
function invalid(message) { return Object.assign(new Error(message), { status: 400 }); }
function text(value) { return String(value ?? '').trim(); }
function date(value) { if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; return value ? String(value).slice(0, 10) : null; }
function number(value, fallback) { const result = Number(value); return Number.isFinite(result) ? Math.round(result) : fallback; }
function validate(data) { if (!data || !/^[1-9]\d*$/.test(text(data.personnelId))) throw invalid('Pilih pegawai yang sudah terdaftar sebelum menambahkan sertifikasi.'); if (!text(data.certificationName)) throw invalid('certificationName is required'); if (data.issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.issueDate)) throw invalid('issueDate must be a valid date'); if (data.expiryDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.expiryDate)) throw invalid('expiryDate must be a valid date'); if (text(data.referenceUrl) && !/^https?:\/\//i.test(text(data.referenceUrl))) throw invalid('referenceUrl must use http or https'); }
function level(value) { return ['Entry Level', 'Intermediate', 'Advanced / Expert'].includes(value) ? value : 'Intermediate'; }
function values(data) { return [text(data.personnelName), text(data.employeeId), text(data.personnelRole), text(data.supervisorName), text(data.certificationName), text(data.issuer), text(data.referenceUrl), level(data.certificationLevel), text(data.status || 'Planned'), date(data.issueDate), date(data.expiryDate), text(data.notes), Boolean(data.onCanvas), number(data.positionX, 24), number(data.positionY, 24), number(data.cardWidth, 260), number(data.cardHeight, 190)]; }
function map(row) { return { id: row.id, personnelId: row.personnel_id, personnelName: row.personnel_name, employeeId: row.employee_id, personnelRole: row.personnel_role, supervisorName: row.supervisor_name || '', certificationName: row.certification_name, issuer: row.issuer, referenceUrl: row.reference_url, certificationLevel: level(row.certification_level), status: row.status, issueDate: date(row.issue_date), expiryDate: date(row.expiry_date), notes: row.notes, onCanvas: Boolean(row.on_canvas), positionX: row.position_x, positionY: row.position_y, cardWidth: row.card_width, cardHeight: row.card_height, createdAt: row.created_at, updatedAt: row.updated_at }; }

async function transaction(action) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await action(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

async function registeredPersonnel(client, data) {
  validate(data);
  // Hold the employee row while writing a certification; identity comes from the register.
  const result = await client.query('SELECT * FROM organization_personnel WHERE id = $1 FOR SHARE', [text(data.personnelId)]);
  if (!result.rowCount) throw invalid('Pegawai tidak ditemukan. Daftarkan pegawai terlebih dahulu.');
  return { ...data, ...employeeMap(result.rows[0]), personnelId: result.rows[0].id };
}

async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS personnel_certifications (id BIGSERIAL PRIMARY KEY, personnel_name TEXT NOT NULL, employee_id TEXT NOT NULL DEFAULT '', personnel_role TEXT NOT NULL DEFAULT '', supervisor_name TEXT NOT NULL DEFAULT '', certification_name TEXT NOT NULL, issuer TEXT NOT NULL DEFAULT '', reference_url TEXT NOT NULL DEFAULT '', certification_level TEXT NOT NULL DEFAULT 'Intermediate', status TEXT NOT NULL DEFAULT 'Planned', issue_date DATE, expiry_date DATE, notes TEXT NOT NULL DEFAULT '', on_canvas BOOLEAN NOT NULL DEFAULT FALSE, position_x INTEGER NOT NULL DEFAULT 24, position_y INTEGER NOT NULL DEFAULT 24, card_width INTEGER NOT NULL DEFAULT 260, card_height INTEGER NOT NULL DEFAULT 190, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS organization_personnel (id BIGSERIAL PRIMARY KEY, personnel_name TEXT NOT NULL, employee_id TEXT NOT NULL DEFAULT '', personnel_role TEXT NOT NULL DEFAULT '', supervisor_name TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query('ALTER TABLE personnel_certifications ADD COLUMN IF NOT EXISTS reference_url TEXT NOT NULL DEFAULT \'\'');
  await pool.query('ALTER TABLE personnel_certifications ADD COLUMN IF NOT EXISTS certification_level TEXT NOT NULL DEFAULT \'Intermediate\'');
  await pool.query('ALTER TABLE personnel_certifications ADD COLUMN IF NOT EXISTS on_canvas BOOLEAN NOT NULL DEFAULT FALSE');
  await pool.query('ALTER TABLE personnel_certifications ADD COLUMN IF NOT EXISTS supervisor_name TEXT NOT NULL DEFAULT \'\'');
  // Roadmap catalog rows now live in certification_roadmap_catalog; drop any legacy leftovers here.
  await pool.query("DELETE FROM personnel_certifications WHERE status = 'Catalog'");
  const migration = await fs.readFile(path.join(__dirname, '../../database/personnel-certification-links.sql'), 'utf8');
  await transaction(client => client.query(migration));
}

async function list() {
  const result = await pool.query(`SELECT c.*, p.personnel_name, p.employee_id, p.personnel_role, p.supervisor_name
    FROM personnel_certifications c JOIN organization_personnel p ON p.id = c.personnel_id
    ORDER BY c.updated_at DESC, c.id DESC`);
  return result.rows.map(map);
}
async function create(data) {
  validate(data);
  return transaction(async client => {
    const person = await registeredPersonnel(client, data);
    const insertFields = [...fields, 'personnel_id'];
    const result = await client.query(`INSERT INTO personnel_certifications (${insertFields.join(', ')}) VALUES (${insertFields.map((_, index) => `$${index + 1}`).join(', ')}) RETURNING *`, [...values(person), person.personnelId]);
    return map(result.rows[0]);
  });
}
async function update(id, data) {
  validate(data);
  return transaction(async client => {
    const person = await registeredPersonnel(client, data);
    const editableFields = [...fields.slice(0, 12), 'personnel_id'];
    const assignments = editableFields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    const result = await client.query(`UPDATE personnel_certifications SET ${assignments}, updated_at = NOW() WHERE id = $${editableFields.length + 1} RETURNING *`, [...values(person).slice(0, 12), person.personnelId, id]);
    if (!result.rowCount) throw Object.assign(new Error('Certification not found'), { status: 404 });
    return map(result.rows[0]);
  });
}
async function updateLayout(id, data) { const result = await pool.query('UPDATE personnel_certifications SET on_canvas = TRUE, certification_level = $1, position_x = $2, position_y = $3, card_width = $4, card_height = $5, updated_at = NOW() WHERE id = $6 RETURNING *', [level(data.certificationLevel), number(data.positionX, 24), number(data.positionY, 24), number(data.cardWidth, 260), number(data.cardHeight, 190), id]); if (!result.rowCount) throw Object.assign(new Error('Certification not found'), { status: 404 }); return map(result.rows[0]); }
async function remove(id) { const result = await pool.query('DELETE FROM personnel_certifications WHERE id = $1', [id]); if (!result.rowCount) throw Object.assign(new Error('Certification not found'), { status: 404 }); }
function employeeMap(row) { return { id: row.id, personnelName: row.personnel_name, employeeId: row.employee_id, personnelRole: row.personnel_role, supervisorName: row.supervisor_name || '', createdAt: row.created_at, updatedAt: row.updated_at }; }
function validateEmployee(data) { if (!data || !text(data.personnelName)) throw invalid('personnelName is required'); if (text(data.supervisorName).toLowerCase() === text(data.personnelName).toLowerCase()) throw invalid('A person cannot supervise themselves'); }
async function listOrganizationPersonnel() { const result = await pool.query('SELECT * FROM organization_personnel ORDER BY personnel_name, id'); return result.rows.map(employeeMap); }
async function createOrganizationPersonnel(data) { validateEmployee(data); const result = await pool.query('INSERT INTO organization_personnel (personnel_name, employee_id, personnel_role, supervisor_name) VALUES ($1,$2,$3,$4) RETURNING *', [text(data.personnelName), text(data.employeeId), text(data.personnelRole), text(data.supervisorName)]); return employeeMap(result.rows[0]); }
async function updateOrganizationPersonnel(id, data) {
  validateEmployee(data);
  return transaction(async client => {
    const result = await client.query('UPDATE organization_personnel SET personnel_name=$1, employee_id=$2, personnel_role=$3, supervisor_name=$4, updated_at=NOW() WHERE id=$5 RETURNING *', [text(data.personnelName), text(data.employeeId), text(data.personnelRole), text(data.supervisorName), id]);
    if (!result.rowCount) throw Object.assign(new Error('Personnel not found'), { status: 404 });
    // Keep compatibility fields aligned for exports and layout endpoint responses.
    await client.query('UPDATE personnel_certifications SET personnel_name=$1, employee_id=$2, personnel_role=$3, supervisor_name=$4, updated_at=NOW() WHERE personnel_id=$5', [text(data.personnelName), text(data.employeeId), text(data.personnelRole), text(data.supervisorName), id]);
    return employeeMap(result.rows[0]);
  });
}
async function removeOrganizationPersonnel(id) {
  try {
    const result = await pool.query('DELETE FROM organization_personnel WHERE id=$1', [id]);
    if (!result.rowCount) throw Object.assign(new Error('Personnel not found'), { status: 404 });
  } catch (error) {
    if (['23503', '23001'].includes(error.code)) throw Object.assign(new Error('Pegawai masih memiliki sertifikasi. Hapus atau pindahkan sertifikasinya terlebih dahulu.'), { status: 409 });
    throw error;
  }
}
module.exports = { ensureStore, list, create, update, updateLayout, remove, listOrganizationPersonnel, createOrganizationPersonnel, updateOrganizationPersonnel, removeOrganizationPersonnel };
