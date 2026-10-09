const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStorageService } = require('../src/services/storageService');
const { pool } = require('../src/config/database');
test.after(() => pool.end());

async function fixture() {
  const localRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'nist-storage-'));
  let settings;
  let snapshot;
  const locations = new Map();
  const objects = new Map();
  const evidence = new Map();
  let failWrite = false;
  let failCommit = false;
  const db = {
    async query(sql, args = []) {
      if (sql === 'BEGIN') snapshot = new Map(locations);
      if (sql === 'ROLLBACK') { locations.clear(); for (const [key, value] of snapshot) locations.set(key, value); }
      if (sql === 'COMMIT' && failCommit) throw new Error('Database unavailable');
      if (sql.startsWith('SELECT mode')) return { rows: settings ? [settings] : [] };
      if (sql.startsWith('INSERT INTO file_storage_settings')) settings = { mode: args[0], directory: args[1], cloud_config: JSON.parse(args[2]) };
      if (sql.startsWith('SELECT root')) return { rows: locations.has(args[0]) ? [locations.get(args[0])] : [] };
      if (sql.startsWith('INSERT INTO file_storage_locations')) locations.set(args[0], { root: args[1], object_key: args[2] });
      if (sql.startsWith('INSERT INTO evidence_files')) evidence.set(args[0],{name:args[1],mimeType:args[2],owner:args[3],content:args[4]});
      if (sql.startsWith('DELETE FROM file_storage_locations')) locations.delete(args[0]);
      return { rows: [] };
    },
    async connect() { return { query: db.query, release() {} }; },
  };
  const cloud = { adapter(config) {
    const keyFor = key => `${config.mode}:${config.bucket}:${key}`;
    return {
      async put(key, body) { if (failWrite) throw new Error('Access denied'); objects.set(keyFor(key), Buffer.from(body)); },
      async read(key) { if (!objects.has(keyFor(key))) throw Object.assign(new Error('Missing'), { code: 404 }); return objects.get(keyFor(key)); },
      async exists(key) { return objects.has(keyFor(key)); },
      async remove(key) { objects.delete(keyFor(key)); },
    };
  } };
  const service = createStorageService({ db, localRoot, cloud });
  return { service, objects, locations, evidence, localRoot, failWrite: () => { failWrite = true; }, failCommit: () => { failCommit = true; }, cleanup: () => fs.rm(localRoot, { recursive: true, force: true }) };
}

for (const mode of ['s3', 'gcs']) test(`${mode}: settings probe, upload, read, replacement and delete retain original bucket`, async () => {
  const f = await fixture();
  try {
    await f.service.saveSettings({ mode, bucket: 'bucket-one', region: 'ap-southeast-1', prefix: 'evidence/prod' });
    assert.equal(f.objects.size, 0);
    await f.service.put('Test/file.pdf', { buffer: Buffer.from('first'), name: 'file.pdf', mimeType: 'application/pdf' });
    assert.equal(await f.service.exists('Test/file.pdf'), true);
    assert.equal((await f.service.read('Test/file.pdf')).toString(), 'first');
    await f.service.saveSettings({ mode, bucket: 'bucket-two', region: 'ap-southeast-1' });
    await f.service.put('Test/file.pdf', { buffer: Buffer.from('replacement'), name: 'file.pdf' }, { replace: true });
    assert.equal(f.objects.size, 1);
    assert.ok([...f.objects.keys()][0].startsWith(`${mode}:bucket-one:evidence/prod/`));
    assert.equal((await f.service.read('Test/file.pdf')).toString(), 'replacement');
    await f.service.remove('Test/file.pdf');
    assert.equal(f.objects.size, 0);
    assert.equal(await f.service.exists('Test/file.pdf'), false);
  } finally { await f.cleanup(); }
});

test('local storage remains readable when new uploads switch to cloud', async () => {
  const f = await fixture();
  try {
    await f.service.put('local.pdf', { buffer: Buffer.from('local'), name: 'local.pdf' });
    await f.service.saveSettings({ mode: 'gcs', bucket: 'bucket-one' });
    assert.equal((await f.service.read('local.pdf')).toString(), 'local');
    await f.service.put('cloud.pdf', { buffer: Buffer.from('cloud'), name: 'cloud.pdf' });
    await f.service.saveSettings({ mode: 'local' });
    assert.equal((await f.service.read('cloud.pdf')).toString(), 'cloud');
    await f.service.remove('local.pdf');
    await f.service.remove('cloud.pdf');
  } finally { await f.cleanup(); }
});

test('cloud failure preserves settings and never falls back to local', async () => {
  const f = await fixture();
  try {
    await f.service.saveSettings({ mode: 's3', bucket: 'bucket-one', region: 'ap-southeast-1' });
    f.failWrite();
    await assert.rejects(f.service.saveSettings({ mode: 'gcs', bucket: 'bucket-two' }), { status: 400 });
    assert.equal((await f.service.getSettings()).mode, 's3');
    await assert.rejects(f.service.put('failed.pdf', { buffer: Buffer.from('fail') }), { status: 503 });
    assert.equal(f.locations.size, 0);
    assert.deepEqual(await fs.readdir(f.localRoot), []);
  } finally { await f.cleanup(); }
});

test('database rollback removes the new object and retains the prior file', async () => {
  const f = await fixture();
  try {
    await f.service.saveSettings({ mode: 'gcs', bucket: 'bucket-one' });
    await f.service.put('file.pdf', { buffer: Buffer.from('original') });
    f.failCommit();
    await assert.rejects(f.service.put('file.pdf', { buffer: Buffer.from('new') }, { replace: true }), { status: 503 });
    assert.equal(f.objects.size, 1);
    assert.equal((await f.service.read('file.pdf')).toString(), 'original');
  } finally { await f.cleanup(); }
});

test('rejects invalid bucket, missing S3 region and unsafe prefix', async () => {
  const f = await fixture();
  try {
    for (const config of [{ mode: 's3', bucket: 'bucket-one' }, { mode: 'gcs', bucket: 'https://bucket' }, { mode: 'gcs', bucket: 'bucket-one', prefix: '../escape' }]) {
      assert.throws(() => f.service.validateSettings(config), { status: 400 });
    }
  } finally { await f.cleanup(); }
});

test('explicit deletion removes the managed object and the original legacy upload only',async()=>{
  const f=await fixture();
  try {
    await fs.mkdir(require('node:path').join(f.localRoot,'policy-register'));
    await fs.writeFile(require('node:path').join(f.localRoot,'policy-register','original.pdf'),'legacy');
    await fs.writeFile(require('node:path').join(f.localRoot,'policy-register','keep.pdf'),'keep');
    await f.service.put('policy-register/original.pdf',{buffer:Buffer.from('managed'),name:'original.pdf',mimeType:'application/pdf'},{replace:true});
    const managed=require('node:path').join(f.localRoot,f.locations.get('policy-register/original.pdf').object_key);
    assert.equal((await fs.readFile(require('node:path').join(f.localRoot,'policy-register','original.pdf'))).toString(),'legacy');
    await f.service.remove('policy-register/original.pdf');
    await assert.rejects(fs.access(managed),{code:'ENOENT'});
    await assert.rejects(fs.access(require('node:path').join(f.localRoot,'policy-register','original.pdf')),{code:'ENOENT'});
    assert.equal((await fs.readFile(require('node:path').join(f.localRoot,'policy-register','keep.pdf'))).toString(),'keep');
  } finally {await f.cleanup();}
});

test('asset and note photos retain original database bytes after storage restore/replacement',async()=>{
 const f=await fixture();try{
 const content=Buffer.from([0,1,128,255]);
 for(const prefix of ['Asset Management/assets/a/front/v','Knowledge Notes/a']){
  const filePath=prefix+'/photo.png';await f.service.put(filePath,{buffer:content,name:'photo.png',mimeType:'image/png',uploadedBy:12});
  assert.deepEqual(f.evidence.get(filePath).content,content);assert.equal(f.evidence.get(filePath).owner,12);
  assert.deepEqual(await f.service.read(filePath),content);
 }
 await f.service.put('Policy/file.pdf',{buffer:content,name:'file.pdf',mimeType:'application/pdf'});
 assert.equal(f.evidence.get('Policy/file.pdf').content,null);
 }finally{await f.cleanup();}
});
