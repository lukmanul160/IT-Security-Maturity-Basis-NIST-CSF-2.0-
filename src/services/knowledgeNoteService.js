const { pool } = require('../config/database');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function validateFolder(value = '') {
  if (typeof value !== 'string' || value.length > 500 || (value && value.split('/').some(part => !part.trim() || part !== part.trim() || ['.','..'].includes(part) || /[\\<>:"|?*\x00-\x1f]/.test(part)))) throw fail('Folder tidak valid. Gunakan nama atau jalur seperti Keamanan/Kebijakan.');
  return value;
}
async function storeFolder(client, folder) {
  const parts = folder.split('/').filter(Boolean);
  for (let i = 1; i <= parts.length; i++) await client.query('INSERT INTO knowledge_note_folders (path) VALUES ($1) ON CONFLICT DO NOTHING',[parts.slice(0,i).join('/')]);
}
function validate(note) {
  if (!note || typeof note.title !== 'string' || !note.title.trim() || note.title.length > 200 || /[\[\]#|/\\<>:"?*\x00-\x1f]/.test(note.title)) throw fail('Judul wajib diisi, maksimal 200 karakter, tanpa karakter tautan atau karakter nama file khusus.');
  if (typeof note.content !== 'string' || Buffer.byteLength(note.content) > 1000000) throw fail('Isi catatan maksimal 1 MB.');
  return { title: note.title.trim(), content: note.content, folder: validateFolder(note.folder) };
}
async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS knowledge_notes (id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query("ALTER TABLE knowledge_notes ADD COLUMN IF NOT EXISTS folder TEXT NOT NULL DEFAULT ''");
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS knowledge_notes_folder_title_unique ON knowledge_notes (folder, LOWER(title))');
  await pool.query(`DO $$ DECLARE table_schema TEXT; BEGIN
    SELECT n.nspname INTO table_schema FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid='knowledge_notes'::regclass;
    EXECUTE format('DROP INDEX IF EXISTS %I.knowledge_notes_title_unique',table_schema);
  END $$`);
  await pool.query('CREATE TABLE IF NOT EXISTS knowledge_note_folders (path TEXT PRIMARY KEY)');
  await require('./knowledgeImageService').ensureStore();
}
const selection = 'id, title, content, folder, version, updated_at AS "updatedAt"';
async function folders() { return (await pool.query('SELECT path FROM knowledge_note_folders ORDER BY path')).rows.map(row=>row.path); }
async function createFolder(path) { const folder = validateFolder(path); if(!folder) throw fail('Nama folder wajib diisi.'); await storeFolder(pool,folder); return folders(); }
async function moveFolder(source, destination) {
  validateFolder(source); validateFolder(destination);
  if (!source || !destination || source === destination || destination.startsWith(source+'/')) throw fail('Folder tidak dapat dipindahkan ke dalam dirinya sendiri.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE knowledge_note_folders, knowledge_notes IN SHARE ROW EXCLUSIVE MODE');
    const existing = (await client.query('SELECT path FROM knowledge_note_folders')).rows.map(row=>row.path);
    if (!existing.includes(source)) throw fail('Folder tidak ditemukan.',404);
    const subtree = existing.filter(path=>path===source || path.startsWith(source+'/'));
    const targets = subtree.map(path=>destination+path.slice(source.length));
    if(targets.some(path=>existing.includes(path) && !subtree.includes(path))) throw fail('Folder tujuan sudah ada.',409);
    targets.forEach(validateFolder);
    for (let i=0;i<subtree.length;i++) await client.query('UPDATE knowledge_note_folders SET path=$1 WHERE path=$2',[targets[i],subtree[i]]);
    await storeFolder(client,destination);
    await client.query("UPDATE knowledge_notes SET folder=$2 || SUBSTRING(folder FROM $3::integer), version=version+1, updated_at=NOW() WHERE folder=$1 OR starts_with(folder,$1 || '/')",[source,destination,[...source].length+1]);
    await client.query("UPDATE knowledge_note_images SET path=$2 || SUBSTRING(path FROM $3::integer),folder=$2 || SUBSTRING(folder FROM $3::integer) WHERE folder=$1 OR starts_with(folder,$1 || '/')",[source,destination,[...source].length+1]);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  return {folders:await folders(),notes:await list()};
}
async function removeFolder(path, mode = 'empty') {
  if (!['empty','all'].includes(mode)) throw fail('Opsi hapus folder tidak valid.');
  validateFolder(path); if(!path) throw fail('Vault utama tidak dapat dihapus.');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE knowledge_note_folders, knowledge_notes IN SHARE ROW EXCLUSIVE MODE');
    if (mode === 'all') {await client.query("DELETE FROM knowledge_notes WHERE folder=$1 OR starts_with(folder,$1 || '/')",[path]);await client.query("DELETE FROM knowledge_note_images WHERE folder=$1 OR starts_with(folder,$1 || '/')",[path]);}
    else if((await client.query("SELECT id FROM knowledge_notes WHERE folder=$1 OR starts_with(folder,$1 || '/') LIMIT 1",[path])).rowCount) throw fail('Folder masih berisi catatan. Gunakan Hapus semua isi folder untuk menghapus folder beserta catatannya.',409);
    if(mode==='empty'&&(await client.query("SELECT id FROM knowledge_note_images WHERE folder=$1 OR starts_with(folder,$1 || '/') LIMIT 1",[path])).rowCount)throw fail('Folder masih berisi gambar. Gunakan Hapus semua isi folder.',409);
    if(!(await client.query("DELETE FROM knowledge_note_folders WHERE path=$1 OR starts_with(path,$1 || '/')",[path])).rowCount) throw fail('Folder tidak ditemukan.',404);
    await client.query('COMMIT');
  } catch(error) {await client.query('ROLLBACK');throw error;}finally{client.release();}
  return folders();
}
async function list() { return (await pool.query(`SELECT ${selection} FROM knowledge_notes ORDER BY LOWER(title)`)).rows; }
async function create(data) {
  const note = validate(data);
  await storeFolder(pool,note.folder);
  try { return (await pool.query(`INSERT INTO knowledge_notes (title,content,folder) VALUES ($1,$2,$3) RETURNING ${selection}`, [note.title,note.content,note.folder])).rows[0]; }
  catch (error) { if (error.code === '23505') throw fail(`Catatan ${note.folder ? note.folder+'/' : ''}${note.title} sudah ada di folder yang sama.`,409); throw error; }
}
async function update(id,data) {
  const note = validate(data);
  if (!Number.isInteger(data.version) || data.version < 1) throw fail('Versi catatan wajib diisi.');
  await storeFolder(pool,note.folder);
  try {
    const result = await pool.query(`UPDATE knowledge_notes SET title=$1,content=$2,folder=$5,version=version+1,updated_at=NOW() WHERE id=$3 AND version=$4 RETURNING ${selection}`,[note.title,note.content,id,data.version,note.folder]);
    if (!result.rowCount) throw fail('Catatan berubah atau dihapus. Ekspor perubahan lokal sebelum memuat ulang.',409);
    return result.rows[0];
  } catch(error) { if(error.code === '23505') throw fail(`Catatan ${note.folder ? note.folder+'/' : ''}${note.title} sudah ada di folder yang sama.`,409); throw error; }
}
async function importNotes(notes, folderPaths = [], images = []) {
  if(!Array.isArray(images)||images.length>100)throw fail('Impor maksimal 100 gambar sekaligus.');
  images.forEach(image=>require('./knowledgeImageService').validate(image));
  if (!Array.isArray(folderPaths) || folderPaths.length > 500) throw fail('Daftar folder tidak valid (maksimal 500).');
  const importedFolders = folderPaths.map(validateFolder);
  if (!Array.isArray(notes) || (!notes.length && !importedFolders.length && !images.length) || notes.length > 200) throw fail('Impor maksimal 200 catatan sekaligus.');
  const values = notes.map(validate);
  const paths = new Set();
  for (const note of values) {
    const key=JSON.stringify([note.folder,note.title.toLowerCase()]);
    if(paths.has(key))throw fail(`Catatan duplikat dalam impor: ${note.folder ? note.folder+'/' : ''}${note.title}. Judul yang sama hanya diperbolehkan di folder berbeda.`);
    paths.add(key);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const folder of importedFolders) await storeFolder(client,folder);
    for(const image of images){await storeFolder(client,image.path.split('/').slice(0,-1).join('/'));await require('./knowledgeImageService').store(client,image);}
    for (const note of values) { await storeFolder(client,note.folder); await client.query('INSERT INTO knowledge_notes (title,content,folder) VALUES ($1,$2,$3)',[note.title,note.content,note.folder]); }
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); if(error.code === '23505') throw fail('Catatan dengan folder dan judul yang sama sudah ada. Impor dibatalkan; gunakan folder lain atau ubah judul catatan di folder tersebut.',409); throw error; }
  finally { client.release(); }
  return list();
}
async function remove(id) { if (!(await pool.query('DELETE FROM knowledge_notes WHERE id=$1',[id])).rowCount) throw fail('Catatan tidak ditemukan.',404); }
module.exports = { validate, validateFolder, ensureStore, list, create, update, importNotes, remove, folders, createFolder, moveFolder, removeFolder };
