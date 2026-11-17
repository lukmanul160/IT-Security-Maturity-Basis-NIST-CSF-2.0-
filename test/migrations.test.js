const test=require('node:test');
const assert=require('node:assert/strict');
const { pool }=require('../src/config/database');
const { migrate,definitions,checksum }=require('../src/services/migrationService');
test.after(()=>pool.end());
test('migration runner serializes concurrent upgrade, is repeatable, and rejects changed history',async()=>{
  const [one,two]=await Promise.all([migrate(pool),migrate(pool)]);
  assert.equal(one.length,definitions().length);assert.deepEqual(one,two);
  const count=Number((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count);
  await migrate(pool);assert.equal(Number((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count),count);
  const client=await pool.connect();
  // Isolate tampering from other test workers via a dedicated schema and connection.
  const schema='migration_'+process.pid;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);
    await client.query('CREATE TABLE schema_migrations(id text primary key,checksum text)');
    await client.query('INSERT INTO schema_migrations VALUES($1,$2)',[definitions()[0].id,'tampered']);
    await assert.rejects(migrate({connect:async()=>({query:client.query.bind(client),release(){}})}),/checksum/);
    assert.equal((await client.query('SELECT checksum FROM schema_migrations')).rows[0].checksum,'tampered');
  } finally {await client.query('SET search_path TO public');await client.query(`DROP SCHEMA ${schema} CASCADE`);client.release();}
});
test('a failed forward migration rolls back DDL and the version ledger together',async()=>{
  const client=await pool.connect(),schema='rollback_'+process.pid;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);
    const plan=[{id:'0001-fixture.sql',sql:'CREATE TABLE retained_fixture(id integer)'},{id:'0002-invalid.sql',sql:'SELECT * FROM missing_fixture_table'}].map(row=>({...row,checksum:checksum(row.sql)}));
    await assert.rejects(migrate({connect:async()=>({query:client.query.bind(client),release(){}})},{plan}),/0002-invalid/);
    assert.equal((await client.query("SELECT to_regclass('retained_fixture') AS present")).rows[0].present,null);
    assert.equal((await client.query("SELECT to_regclass('schema_migrations') AS present")).rows[0].present,null);
  } finally {await client.query('SET search_path TO public');await client.query(`DROP SCHEMA ${schema} CASCADE`);client.release();}
});
test('adopting a legacy schema preserves existing business records',async()=>{
  const client=await pool.connect(),schema='legacy_'+process.pid;
  try {
    await client.query(`CREATE SCHEMA ${schema}`);await client.query(`SET search_path TO ${schema}`);
    await client.query(require('node:fs').readFileSync(require('node:path').join(__dirname,'../database/schema.sql'),'utf8'));
    const marker={scores:{'GV.OC-01':3},notes:{'GV.OC-01':'legacy evidence retained'}};
    await client.query('INSERT INTO assessment_state(id,data) VALUES($1,$2)',['legacy-fixture',marker]);
    await migrate({connect:async()=>({query:client.query.bind(client),release(){}})});
    assert.deepEqual((await client.query("SELECT data FROM assessment_state WHERE id='legacy-fixture'")).rows[0].data,marker);
  } finally {await client.query('SET search_path TO public');await client.query(`DROP SCHEMA ${schema} CASCADE`);client.release();}
});
