const {test}=require('node:test');
const assert=require('node:assert/strict');
const smtp=require('../src/services/smtpService');
const policy=require('../src/services/policyReminderService');
const {pool}=require('../src/config/database');
const connection={host:'smtp.example.com',port:587,security:'starttls',username:'service',from:'sender@example.com'};
const audit=require('../src/services/auditFindingReminderService');
const selectedId='aabbccdd-1234-4321-abcd-123456789abc';
test('registering an SMTP account creates a separate record and validates its name',async t=>{
  let row;
  t.mock.method(pool,'query',async(sql,params)=>{
    assert.ok(sql.includes('app_smtp_accounts'));
    if(sql.startsWith('INSERT')) row={id:params[0],settings:params[1],secret:params[2]};
    return {rows:[row]};
  });
  const saved=await smtp.createAccount({...connection,name:'Policy'});
  assert.equal(saved.id,row.id);assert.equal(saved.name,'Policy');assert.equal(saved.configured,true);assert.equal(saved.secret,undefined);
  await assert.rejects(smtp.createAccount({...connection,name:''}),{status:400});
});
test('registered accounts are listed without exposing encrypted secrets',async t=>{
  t.mock.method(pool,'query',async sql=>({rows:sql.includes('app_smtp_accounts') ? [{id:selectedId,settings:{...connection,name:'Audit'},secret:'ciphertext'}] : [{settings:connection,secret:'legacy-secret'}]}));
  const accounts=await smtp.listAccounts();
  assert.equal(accounts.length,2);assert.equal(accounts[0].id,'default');assert.equal(accounts[1].id,selectedId);
  assert.equal(accounts[1].hasPassword,true);assert.equal(accounts[1].secret,undefined);assert.equal(accounts[1].password,undefined);
});
test('editing one registered SMTP account preserves its secret and leaves the default untouched',async t=>{
  let row={settings:{...connection,name:'Audit'},secret:'encrypted-existing'};
  t.mock.method(pool,'query',async(sql,params)=>{
    assert.ok(sql.includes('app_smtp_accounts'));
    if(sql.startsWith('UPDATE')) {assert.equal(params[2],selectedId);row={settings:params[0],secret:params[1]};}
    else assert.equal(params[0],selectedId);
    return {rows:[row]};
  });
  const saved=await smtp.saveSettings({host:'audit.example.com',password:''},selectedId);
  assert.equal(saved.host,'audit.example.com');assert.equal(saved.hasPassword,true);assert.equal(row.secret,'encrypted-existing');
});
test('policy and audit test emails use their own saved SMTP selection',async t=>{
  const used=[];
  t.mock.method(pool,'query',async sql=>({rows:[{settings:{smtpAccountId:sql.includes('policy_reminder_settings') ? selectedId : 'default'}}]}));
  t.mock.method(smtp,'createMailer',async id=>{used.push(id);return {from:connection.from,mailer:{close(){}}};});
  t.mock.method(smtp,'send',async()=>{});
  await policy.testEmail('receiver@example.com');await audit.testEmail('receiver@example.com');
  assert.deepEqual(used,[selectedId,'default']);
});
test('unknown SMTP accounts cannot be saved even for a disabled reminder',async t=>{
  let writes=0;
  t.mock.method(pool,'query',async(sql,params)=>{if(sql.startsWith('INSERT'))writes++;return {rows:[]};});
  await assert.rejects(policy.saveSettings({enabled:false,smtpAccountId:selectedId}),/tidak ditemukan/);
  await assert.rejects(audit.saveSettings({enabled:false,smtpAccountId:selectedId}),/tidak ditemukan/);
  assert.equal(writes,0);
  assert.throws(()=>smtp.accountId('../invalid'),{status:400});
});
test('SMTP validates TLS, port, sender and header injection',()=>{
  assert.deepEqual(smtp.validate(connection),connection);
  for(const change of [{port:0},{security:'none'},{host:'host\r\nInjected'},{from:'bad'},{password:123}])assert.throws(()=>smtp.validate({...connection,...change}),{status:400});
});
test('SMTP updates preserve encrypted password and never change reminder settings',async t=>{
  let row={settings:connection,secret:'encrypted-existing'};const writes=[];
  t.mock.method(pool,'query',async(sql,params)=>{
    assert.ok(sql.includes('app_smtp_settings'));
    if(params){writes.push(params);row={settings:params[0],secret:params[1]};}
    return {rows:[row]};
  });
  const result=await smtp.saveSettings({host:'new.example.com',password:''});
  assert.equal(writes[0][1],'encrypted-existing');assert.equal(result.hasPassword,true);assert.equal(result.secret,undefined);assert.equal(result.password,undefined);
  await smtp.saveSettings({clearPassword:true});assert.equal(row.secret,'');
});
test('reminder API hides legacy credentials and saves only module settings',async t=>{
  let stored={...connection,enabled:false,daysBefore:30,owners:[]};let written;
  t.mock.method(smtp,'listAccounts',async()=>[]);
  t.mock.method(smtp,'getSettings',async()=>({configured:true}));
  t.mock.method(pool,'query',async(sql,params)=>{assert.ok(sql.includes('policy_reminder_settings'));if(params){written=params[0];stored=written;}return {rows:[{settings:stored,secret:'legacy-secret'}]};});
  const visible=await policy.getSettings();assert.equal(visible.host,undefined);assert.equal(visible.username,undefined);assert.equal(visible.hasPassword,undefined);assert.equal(visible.smtpConfigured,true);
  await policy.saveSettings({daysBefore:14});assert.equal(written.daysBefore,14);assert.equal(written.host,undefined);
  await assert.rejects(policy.saveSettings({host:'wrong-place'}),{status:400});
});
test('enabling a reminder requires central SMTP but disabled drafts may be saved',async t=>{
  let writes=0;t.mock.method(smtp,'getSettings',async()=>({configured:false}));
  t.mock.method(pool,'query',async(sql,params)=>{if(params)writes++;return {rows:[]};});
  await assert.rejects(policy.saveSettings({enabled:true,owners:[{owner:'CISO',email:'owner@example.com'}]}),/Konfigurasikan SMTP/);
  assert.equal(writes,0);await policy.saveSettings({enabled:false});assert.equal(writes,1);
});
test('policy test messages use central connection and local template',async t=>{
  const sent=[];let closed=false;
  t.mock.method(smtp,'createMailer',async()=>({from:'central@example.com',mailer:{close(){closed=true;}}}));
  t.mock.method(smtp,'send',async(mailer,message)=>sent.push(message));
  t.mock.method(pool,'query',async()=>({rows:[{settings:{subjectTemplate:'Review {{title}}',bodyTemplate:'Owner {{owner}}'}}]}));
  await policy.testEmail('receiver@example.com');assert.equal(sent[0].from,'central@example.com');assert.match(sent[0].subject,/^Review/);assert.equal(sent[0].text,'Owner CISO');assert.equal(closed,true);
});
test('SMTP routes reject non-admin roles before reading or writing settings',async t=>{
  const express=require('express');const app=express();
  app.use(express.json());app.use((req,res,next)=>{req.user={role:'viewer'};next();});
  app.use('/smtp',require('../src/routes/smtpRoutes'));
  t.mock.method(smtp,'getSettings',async()=>{throw new Error('Should not read SMTP');});
  t.mock.method(smtp,'saveSettings',async()=>{throw new Error('Should not write SMTP');});
  t.mock.method(smtp,'testEmail',async()=>{throw new Error('Should not send email');});
  const server=await new Promise(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  try{for(const [method,url] of [['GET','/smtp'],['PUT','/smtp'],['POST','/smtp/test']])assert.equal((await fetch('http://127.0.0.1:'+server.address().port+url,{method})).status,403);}
  finally{await new Promise(resolve=>server.close(resolve));}
});
test('legacy SMTP migration preserves settings and ciphertext, is idempotent, and keeps reminder schedule', {skip:process.env.RUN_SMTP_DB_TESTS!=='1'},async t=>{
  const client=await pool.connect();
  try {
    await client.query("CREATE TEMP TABLE policy_reminder_settings (id INTEGER PRIMARY KEY, settings JSONB, secret TEXT)");
    await client.query("CREATE TEMP TABLE app_smtp_settings (id INTEGER PRIMARY KEY, settings JSONB, secret TEXT)");
    await client.query('INSERT INTO policy_reminder_settings VALUES (1,$1,$2)',[{...connection,enabled:true,daysBefore:12,owners:[{owner:'CISO',email:'owner@example.com'}]},'unchanged-ciphertext']);
    t.mock.method(pool,'connect',async()=>({query:client.query.bind(client),release(){}}));
    await smtp.ensureStore();await smtp.ensureStore();
    const central=(await client.query('SELECT * FROM app_smtp_settings')).rows[0];
    const local=(await client.query('SELECT * FROM policy_reminder_settings')).rows[0];
    assert.deepEqual(central.settings,connection);assert.equal(central.secret,'unchanged-ciphertext');
    assert.equal(local.settings.daysBefore,12);assert.equal(local.settings.enabled,true);assert.equal(local.settings.host,undefined);assert.equal(local.secret,'');
    await client.query("UPDATE app_smtp_settings SET settings = settings || '{\"host\":\"new.example.com\"}'::jsonb");
    await smtp.ensureStore();assert.equal((await client.query('SELECT settings FROM app_smtp_settings')).rows[0].settings.host,'new.example.com');
  }finally{await client.query('DROP TABLE IF EXISTS pg_temp.app_smtp_settings, pg_temp.policy_reminder_settings');client.release();await pool.end();}
});
