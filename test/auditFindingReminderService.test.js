const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/auditFindingReminderService');
const smtp = require('../src/services/smtpService');
const { pool } = require('../src/config/database');
test('settings validate recipients and refuse module SMTP credentials', () => {
  assert.deepEqual(service.validate({enabled:true,daysBefore:7,recipients:['A@example.com','a@example.com']}), {enabled:true,daysBefore:7,recipients:['a@example.com']});
  for (const change of [{recipients:[]},{recipients:['invalid']},{daysBefore:-1},{password:'secret'}]) assert.throws(()=>service.validate({enabled:true,daysBefore:7,recipients:['a@example.com'],...change}),{status:400});
});
test('reminders include audit title and finding, skip closed/undated/future and include overdue', () => {
  const row = {auditTitle:'Audit title',data:{title:'Finding title',status:'Open',dueDate:'2026-09-20'}};
  const now = new Date(2026,8,16,12);
  assert.equal(service.eligible(row,7,now),true);
  assert.equal(service.eligible({...row,data:{...row.data,status:'Closed'}},7,now),false);
  assert.equal(service.eligible({...row,data:{...row.data,dueDate:''}},7,now),false);
  assert.equal(service.eligible({...row,data:{...row.data,dueDate:'2026-09-24'}},7,now),false);
  assert.equal(service.eligible({...row,data:{...row.data,dueDate:'2020-01-01'}},0,now),true);
  assert.match(service.renderMessage(row).text,/Judul: Audit title\nFinding: Finding title/);
});
test('test email uses central SMTP and closes transport', async t => {
  const sent=[]; let closed=false;
  t.mock.method(smtp,'createMailer',async()=>({from:'admin@example.com',mailer:{close(){closed=true;}}}));
  t.mock.method(smtp,'send',async(mailer,message)=>sent.push(message));
  await service.testEmail('test@example.com');
  assert.equal(sent[0].from,'admin@example.com');assert.match(sent[0].text,/Judul:.*\nFinding:/);assert.equal(closed,true);
});
test('scheduler retries failed delivery and deduplicates successful delivery', async t => {
  const delivered=new Set();let sends=0,closed=0;
  const settings={enabled:true,daysBefore:7,recipients:['test@example.com']};
  t.mock.method(pool,'query',async()=>({rows:[{settings}]}));
  const row={id:'finding-1',auditTitle:'Audit',data:{title:'Finding',status:'Open',dueDate:'2000-01-01'}};
  t.mock.method(pool,'connect',async()=>({release(){},async query(sql,params){
    if(sql.includes('pg_try'))return {rows:[{locked:true}]};
    if(sql.includes('SELECT f.id'))return {rows:[row,{...row,id:'closed',data:{...row.data,status:'Closed'}}]};
    if(sql.startsWith('SELECT 1'))return {rowCount:delivered.has(JSON.stringify(params))?1:0};
    if(sql.startsWith('INSERT'))delivered.add(JSON.stringify(params));
    return {rows:[]};
  }}));
  t.mock.method(smtp,'createMailer',async()=>({from:'admin@example.com',mailer:{close(){closed++;}}}));
  t.mock.method(smtp,'send',async()=>{sends++;if(sends===1)throw Error('failure');});
  await service.runReminders();assert.equal(delivered.size,0);
  await service.runReminders();await service.runReminders();
  assert.equal(sends,2);assert.equal(delivered.size,1);assert.equal(closed,3);
});
test('settings endpoints reject non-admin before service access', async t => {
  const express=require('express');const app=express();
  app.use(express.json());app.use((req,res,next)=>{req.user={role:'editor'};next();});
  app.use('/tracker',require('../src/routes/auditFindingRoutes'));
  t.mock.method(service,'getSettings',async()=>{throw Error('Must not access');});
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try { for(const [method,path] of [['GET',''],['PUT',''],['POST','/test']])assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/tracker/reminder-settings${path}`,{method})).status,403); }
  finally { await new Promise(resolve=>server.close(resolve)); }
});
