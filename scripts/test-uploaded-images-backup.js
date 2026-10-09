const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pool } = require('../src/config/database');
const photos = require('../src/services/assetRackPhotoService');
const images = require('../src/services/knowledgeImageService');
const { createFileBackupService } = require('../src/services/fileBackupService');
const { normalizePath } = require('../src/services/storageService');

async function run() {
  await photos.ensureStore();
  await images.ensureStore();
  const client = await pool.connect();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-image-backup-check-'));
  try {
    await client.query('BEGIN');
    const owner = (await client.query('SELECT id FROM app_users ORDER BY id LIMIT 1')).rows[0]?.id;
    assert.ok(owner, 'An existing user is required');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5foAAAAASUVORK5CYII=', 'base64');
    const file = { buffer: png, mimetype: 'image/png', originalname: 'photo.png' };
    const registered = [];
    for (const [kind, table] of [['assets', 'managed_assets'], ['racks', 'asset_racks']]) {
      const id = randomUUID();
      if (kind === 'assets') await client.query(`INSERT INTO ${table}(id,tag,data) VALUES($1,$2,$3)`, [id, `TEST-${id}`, { name: 'Backup test' }]);
      else await client.query(`INSERT INTO ${table}(id,name,units,location) VALUES($1,$2,42,$3)`, [id, `TEST-${id}`, 'Backup test']);
      await photos.applyChanges(client, kind, id, photos.prepareChanges({ front: [file], rear: [file] }, {}), owner);
      const photoTable = kind === 'assets' ? 'managed_asset_photos' : 'asset_rack_photos';
      const column = kind === 'assets' ? 'asset_id' : 'rack_id';
      registered.push({ photoTable, column, id });
    }
    const note = await images.store(client, { path: `Backup Test/${randomUUID()}.png`, content: png, uploadedBy: owner });
    const paths = [];
    for (const record of registered) {
      for (const row of (await client.query(`SELECT evidence_path FROM ${record.photoTable} WHERE ${record.column}=$1`, [record.id])).rows) paths.push(row.evidence_path);
    }
    paths.push((await client.query('SELECT evidence_path FROM knowledge_note_images WHERE id=$1', [note.id])).rows[0].evidence_path);
    const original=Buffer.from('# Original\r\nKnowledge source file.\r\n');
    const documentPath=await require('../src/services/knowledgeDocumentService').store(client,{path:'Backup Test/Original.md',content:original,uploadedBy:owner});
    paths.push(documentPath);
    const rows = (await client.query('SELECT * FROM evidence_files WHERE path=ANY($1::text[])', [paths])).rows;
    assert.equal(rows.length, 6);
    for (const row of rows) { assert.ok(row.content.equals(row.path===documentPath?original:png)); assert.equal(String(row.uploaded_by), String(owner)); }
    // Use database binaries, as production ZIP backup does when no storage object exists.
    const db = { query: (sql, args) => sql.includes('FROM evidence_files ORDER BY path') ? client.query(sql.replace('FROM evidence_files ORDER BY path', 'FROM evidence_files WHERE path=ANY($1::text[]) ORDER BY path'), [paths]) : client.query(sql, args) };
    const store = {
      normalizePath,
      read: async () => { throw Object.assign(new Error('Database image'), { code: 'ENOENT' }); },
      put: async (filePath, item) => client.query('UPDATE evidence_files SET content=$2,mime_type=$3 WHERE path=$1', [filePath, await fs.readFile(item.sourcePath), item.mimeType]),
    };
    const backup = createFileBackupService({ db, store, root });
    const archive = await backup.create();
    assert.equal(archive.fileCount, 6);
    for (const record of registered) await client.query(`UPDATE ${record.photoTable} SET content=$2 WHERE ${record.column}=$1`, [record.id, Buffer.from('changed')]);
    await client.query('UPDATE knowledge_note_images SET content=$2 WHERE id=$1', [note.id, Buffer.from('changed')]);
    await client.query('UPDATE evidence_files SET content=$2 WHERE path=$1',[documentPath,Buffer.from('changed')]);
    const source = path.join(root, 'restore.zip');
    await fs.copyFile(await backup.resolve(archive.fileName), source);
    assert.equal((await backup.restore({ path: source, originalname: 'restore.zip' })).fileCount, 6);
    for (const record of registered) for (const row of (await client.query(`SELECT content FROM ${record.photoTable} WHERE ${record.column}=$1`, [record.id])).rows) assert.ok(row.content.equals(png));
    assert.ok((await client.query('SELECT content FROM knowledge_note_images WHERE id=$1', [note.id])).rows[0].content.equals(png));
    assert.ok((await client.query('SELECT content FROM evidence_files WHERE path=$1',[documentPath])).rows[0].content.equals(original));
    await client.query('DELETE FROM evidence_files WHERE path=ANY($1::text[])', [paths]);
    for (const record of registered) assert.equal((await client.query(`SELECT 1 FROM ${record.photoTable} WHERE ${record.column}=$1`, [record.id])).rowCount, 0);
    assert.equal((await client.query('SELECT 1 FROM knowledge_note_images WHERE id=$1', [note.id])).rowCount, 0);
    console.log('PASS: uploaded-file ownership, original photo bytes, asset/rack/note ZIP restore and library deletion. Test records rolled back.');
  } finally {
    await client.query('ROLLBACK');
    client.release();
    await fs.rm(root, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => pool.end());
