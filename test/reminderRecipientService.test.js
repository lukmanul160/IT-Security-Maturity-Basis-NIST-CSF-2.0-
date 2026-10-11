const test=require('node:test');const assert=require('node:assert/strict');
const service=require('../src/services/reminderRecipientService');const {pool}=require('../src/config/database');
test('recipient register validates names and email addresses',()=>{
 assert.deepEqual(service.validate({owner:' SOC Manager ',email:' SOC@EXAMPLE.COM '}),{owner:'SOC Manager',email:'soc@example.com'});
 for(const data of [{owner:'',email:'a@example.com'},{owner:'SOC',email:'invalid'},{owner:'x'.repeat(161),email:'a@example.com'}])assert.throws(()=>service.validate(data),{status:400});
});
test('register persists recipients and updates same name without duplicates',async t=>{
 const client=await pool.connect();try{
 await client.query('CREATE TEMP TABLE reminder_recipient_register(owner_key TEXT PRIMARY KEY,owner TEXT NOT NULL,email TEXT NOT NULL,updated_at TIMESTAMPTZ DEFAULT NOW())');
 t.mock.method(pool,'query',client.query.bind(client));
 await service.save({owner:'SOC Manager',email:'soc@example.com'});
 await service.save({owner:'soc manager',email:'replacement@example.com'});
 assert.deepEqual(await service.list(),[{owner:'soc manager',email:'replacement@example.com'}]);
 }finally{client.release(true);await pool.end();}
});
