const { pool } = require('../config/database');
const stencils = require('../shared/threatStencils.json');
const invalid = message => Object.assign(new Error(message), { status: 400 });
const types = ['actor', 'process', 'service', 'datastore', 'boundary', 'note'];
const categories = ['Spoofing', 'Tampering', 'Repudiation', 'Information disclosure', 'Denial of service', 'Elevation of privilege'];
function validate(model) {
  if (!model || typeof model.name !== 'string' || !model.name.trim() || model.name.length > 200) throw invalid('Nama diagram wajib diisi (maksimal 200 karakter).');
  const diagram = model.diagram;
  if (!diagram || !Array.isArray(diagram.nodes) || !Array.isArray(diagram.edges) || diagram.nodes.length > 500 || diagram.edges.length > 1000) throw invalid('Diagram tidak valid (maksimal 500 komponen / 1000 aliran data).');
  const canvas = diagram.canvas ?? { width: 2400, height: 1600 };
  if (!canvas || ![canvas.width, canvas.height].every(value => Number.isSafeInteger(value) && value >= 400)) throw invalid('Ukuran canvas harus 400–12000 px.');
  const ids = new Set();
  for (const item of [...diagram.nodes, ...diagram.edges]) {
    if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 100 || ids.has(item.id) || typeof item.label !== 'string' || item.label.length > 500) throw invalid('ID atau label komponen / aliran data tidak valid.');
    ids.add(item.id);
    if (item.outOfScope !== undefined && typeof item.outOfScope !== 'boolean' || item.reasonOutOfScope !== undefined && (typeof item.reasonOutOfScope !== 'string' || item.reasonOutOfScope.length > 10000)) throw invalid('Properti scope tidak valid.');
    const stencil = item.stencilId === undefined ? null : stencils.find(stencil => stencil.id === item.stencilId);
    if (item.stencilId !== undefined && (!stencil || stencil.type !== ('source' in item ? 'flow' : item.type))) throw invalid('Stencil tidak valid untuk jenis elemen.');
    if (item.properties !== undefined) {
      if (!stencil || !item.properties || typeof item.properties !== 'object' || Array.isArray(item.properties)) throw invalid('Element properties tidak valid.');
      for (const [key, value] of Object.entries(item.properties)) {
        const property = stencil.properties.find(property => property.key === key);
        if (!property || typeof value !== 'string' || value.length > 1000 || property.options.length && !property.options.includes(value)) throw invalid('Nilai element property tidak valid.');
      }
    }
    if (typeof item.description !== 'string' || item.description.length > 10000 || !Array.isArray(item.threats) || item.threats.length > 100) throw invalid('Deskripsi atau daftar ancaman tidak valid.');
    for (const threat of item.threats) {
      if (!threat || typeof threat.id !== 'string' || typeof threat.title !== 'string' || !threat.title.trim() || threat.title.length > 500 || !categories.includes(threat.category) || !['Low', 'Medium', 'High', 'Critical'].includes(threat.severity) || !['Open', 'Mitigated', 'Accepted'].includes(threat.status) || typeof threat.mitigation !== 'string' || threat.mitigation.length > 10000) throw invalid('Ancaman STRIDE tidak valid.');
    }
  }
  const nodeIds = new Set(diagram.nodes.map(node => node.id));
  for (const node of diagram.nodes) {
    if (!types.includes(node.type) || !/^#[0-9a-f]{6}$/i.test(node.color) || ![node.x, node.y, node.width, node.height].every(Number.isFinite) || node.width < 60 || node.height < 40) throw invalid('Posisi, ukuran, atau jenis komponen tidak valid.');
  }
  if (diagram.edges.some(edge => !nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target)) throw invalid('Aliran data harus menghubungkan dua komponen yang tersedia.');
  if (model.version !== undefined && (!Number.isInteger(model.version) || model.version < 1)) throw invalid('Versi diagram tidak valid.');
  return model;
}
async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS threat_models (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, diagram JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}
const selection = 'id, name, diagram, version, updated_at AS "updatedAt"';
async function list() { return (await pool.query(`SELECT ${selection} FROM threat_models ORDER BY updated_at DESC, id DESC`)).rows; }
async function create(data) {
  validate(data);
  return (await pool.query(`INSERT INTO threat_models (name, diagram) VALUES ($1, $2::jsonb) RETURNING ${selection}`, [data.name.trim(), JSON.stringify(data.diagram)])).rows[0];
}
async function update(id, data) {
  validate(data);
  if (!Number.isInteger(data.version)) throw invalid('Versi diagram wajib diisi.');
  const result = await pool.query(`UPDATE threat_models SET name=$1, diagram=$2::jsonb, version=version+1, updated_at=NOW() WHERE id=$3 AND version=$4 RETURNING ${selection}`, [data.name.trim(), JSON.stringify(data.diagram), id, data.version]);
  if (!result.rowCount) throw Object.assign(new Error('Diagram berubah atau sudah dihapus. Muat ulang diagram sebelum menyimpan; export JSON untuk menjaga perubahan lokal.'), { status: 409 });
  return result.rows[0];
}
async function remove(id) { const result = await pool.query('DELETE FROM threat_models WHERE id=$1', [id]); if (!result.rowCount) throw Object.assign(new Error('Diagram tidak ditemukan.'), { status: 404 }); }
module.exports = { validate, types, categories, ensureStore, list, create, update, remove };
