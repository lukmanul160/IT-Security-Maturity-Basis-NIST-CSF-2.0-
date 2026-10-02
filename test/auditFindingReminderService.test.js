const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/auditFindingReminderService');
const smtp = require('../src/services/smtpService');
const { pool } = require('../src/config/database');
test('settings validate recipients and refuse module SMTP credentials', () => {
  assert.deepEqual(service.validate({enabled:true,daysBefore:7,recipients:['A@example.com','a@example.com']}), {...service.templateDefaults,enabled:true,daysBefore:7,repeatDaily:false,startUnit:'days',repeatEvery:1,repeatUnit:'days',maxDeliveries:366,recipients:['a@example.com']});
  for (const change of [{recipients:[]},{recipients:['invalid']},{daysBefore:-1},{repeatDaily:'yes'},{startUnit:'years'},{repeatUnit:'weeks'},{repeatEvery:0},{repeatEvery:1.5},{repeatEvery:37,repeatUnit:'months'},{daysBefore:37,startUnit:'months'},{maxDeliveries:0},{maxDeliveries:367},{maxDeliveries:1.5},{maxDeliveries:'3'},{password:'secret'}]) assert.throws(()=>service.validate({enabled:true,daysBefore:7,recipients:['a@example.com'],...change}),{status:400});
});
test('reminders include audit title and finding, skip closed/undated/future and stop after due date', () => {
  const row = {kind:'finding',auditTitle:'Audit title',data:{title:'Finding title',status:'Open',dueDate:'2026-09-20'}};
  const now = new Date(2026,8,16,12);
  assert.equal(service.eligible(row,7,now),true);
  assert.equal(service.eligible({...row,data:{...row.data,status:'Closed'}},7,now),false);
  assert.equal(service.eligible({...row,data:{...row.data,dueDate:''}},7,now),false);
  assert.equal(service.eligible({...row,data:{...row.data,dueDate:'2026-09-24'}},7,now),false);
  assert.equal(service.eligible({...row,data:{...row.data,dueDate:'2020-01-01'}},0,now),false);
  assert.match(service.renderMessage(row).text,/Jenis audit: Audit title\nFinding: Finding title/);
  assert.equal(service.renderMessage(row).subject,'Pengingat tindak lanjut audit: Audit title - Finding title');
  for (const kind of ['audit','followup','evidence']) assert.equal(service.eligible({...row,kind},7,now),false);
  assert.equal(service.eligible({...row,auditStatus:'Closed',auditDueDate:'2099-01-01',followupDueDate:'2099-01-01'},7,now),true);
});
test('test email uses central SMTP and closes transport', async t => {
  const sent=[]; let closed=false;
  t.mock.method(pool,'query',async()=>({rows:[{settings:{subjectTemplate:'Tes {{owner}}',bodyTemplate:'Jenis audit: {{auditTitle}}\nFinding: {{finding}}'}}]}));
  t.mock.method(smtp,'createMailer',async()=>({from:'admin@example.com',mailer:{close(){closed=true;}}}));
  t.mock.method(smtp,'send',async(mailer,message)=>sent.push(message));
  await service.testEmail('test@example.com');
  assert.equal(sent[0].subject,'Tes PIC Audit');assert.equal(sent[0].from,'admin@example.com');assert.match(sent[0].text,/Jenis audit:.*\nFinding:/);assert.equal(closed,true);
});

test('saved templates survive reloading settings and schedule-only updates', async t => {
  let stored;
  t.mock.method(pool,'query',async(sql,params)=>{
    if(sql.startsWith('INSERT')) stored=JSON.parse(JSON.stringify(params[0]));
    return {rows:stored ? [{settings:stored}] : []};
  });
  t.mock.method(smtp,'getSettings',async()=>({configured:false}));
  const templates={subjectTemplate:'Tindak lanjut {{finding}}',bodyTemplate:'Yth. {{owner}},\nMohon selesai sebelum {{dueDate}}.'};
  const saved=await service.saveSettings({enabled:false,daysBefore:7,recipients:[],...templates});
  for(const result of [saved,await service.getSettings(),await service.saveSettings({daysBefore:3}),await service.getSettings()]) {
    assert.equal(result.subjectTemplate,templates.subjectTemplate);
    assert.equal(result.bodyTemplate,templates.bodyTemplate);
  }
});

test('custom content validates templates and renders plain text without recursive substitution', () => {
  const settings = {enabled:false,daysBefore:7,recipients:[],subjectTemplate:'Review {{finding}}',bodyTemplate:'Halo {{owner}}\n{{description}}\n{{dueDate}}'};
  assert.equal(service.validate(settings).subjectTemplate, settings.subjectTemplate);
  assert.deepEqual(service.renderMessage({auditTitle:'Audit',data:{title:'Access\nreview',owner:'{{finding}}',description:'<b>Review</b>',dueDate:'2026-12-31'}}, settings), {
    subject:'Review Access review',text:'Halo {{finding}}\n<b>Review</b>\n2026-12-31'
  });
  for (const changes of [{subjectTemplate:''},{subjectTemplate:'Bad\nHeader'},{subjectTemplate:'x'.repeat(201)},{bodyTemplate:' '},{bodyTemplate:'x'.repeat(10001)},{bodyTemplate:'{{unknown}}'}]) {
    assert.throws(()=>service.validate({...settings,...changes}),{status:400});
  }
});
test('scheduler retries failed delivery and deduplicates successful delivery', async t => {
  const delivered=new Set();let sends=0,closed=0;
  const settings={enabled:true,daysBefore:7,repeatDaily:true,recipients:['test@example.com'],subjectTemplate:'Custom {{finding}}',bodyTemplate:'Audit {{auditTitle}}'};
  t.mock.method(pool,'query',async()=>({rows:[{settings}]}));
  const row={id:'finding-1',kind:'finding',auditTitle:'Audit',data:{title:'Finding',status:'Open',dueDate:'2026-09-20'}};
  t.mock.method(pool,'connect',async()=>({release(){},async query(sql,params){
    if(sql.includes('pg_try'))return {rows:[{locked:true}]};
    if(sql.includes('SELECT f.id'))return {rows:[row,{...row,id:'closed',data:{...row.data,status:'Closed'}},{...row,id:'followup',kind:'followup'},{...row,id:'audit',kind:'audit'}]};
    if(sql.startsWith('SELECT COUNT')) { const matches=[...delivered].map(value=>JSON.parse(value)).filter(stored=>params.slice(0,3).every((value,index)=>stored[index]===value)); return {rows:[{count:matches.length,sent_in_slot:matches.some(stored=>stored[3]>=params[3])}]}; }
    if(sql.startsWith('INSERT'))delivered.add(JSON.stringify(params));
    return {rows:[]};
  }}));
  t.mock.method(smtp,'createMailer',async()=>({from:'admin@example.com',mailer:{close(){closed++;}}}));
  t.mock.method(smtp,'send',async(mailer,message)=>{assert.equal(message.subject,'Custom Finding');assert.equal(message.text,'Audit Audit');sends++;if(sends===1)throw Error('failure');});
  await service.runReminders(new Date(2026,8,19,12));assert.equal(delivered.size,0);
  await service.runReminders(new Date(2026,8,19,12));await service.runReminders(new Date(2026,8,19,12));
  assert.equal(sends,2);assert.equal(delivered.size,1);assert.equal(closed,3);
  await service.runReminders(new Date(2026,8,20,12));
  await service.runReminders(new Date(2026,8,20,18));
  assert.equal(sends,3);assert.equal(delivered.size,2);
  await service.runReminders(new Date(2026,8,21,12));
  assert.equal(sends,3);
  settings.maxDeliveries=2;
  delivered.clear();
  const before=sends;
  await service.runReminders(new Date(2026,8,16,12));
  await service.runReminders(new Date(2026,8,17,12));
  await service.runReminders(new Date(2026,8,18,12));
  assert.equal(sends,before+2);assert.equal(delivered.size,2);
  settings.repeatDaily=false;
  delivered.clear();
  await service.runReminders(new Date(2026,8,19,12));
  await service.runReminders(new Date(2026,8,20,12));
  assert.equal(sends,before+3);
  Object.assign(settings,{daysBefore:3,startUnit:'months',repeatDaily:true,repeatEvery:1,repeatUnit:'months',maxDeliveries:4});
  row.data.dueDate='2026-12-31';
  delivered.clear();
  const monthlyBefore=sends;
  for(const date of ['2026-09-30','2026-10-01','2026-10-30','2026-10-31','2026-11-01','2026-11-30','2026-12-30','2026-12-31','2027-01-01']) {
    await service.runReminders(new Date(`${date}T12:00:00`));
  }
  assert.equal(sends,monthlyBefore+4);
  assert.deepEqual([...delivered].map(value=>JSON.parse(value)[3]),['2026-09-30','2026-10-31','2026-11-30','2026-12-31']);
});

test('calendar intervals clamp month ends, support leap years and catch up only the latest slot', () => {
  const row={kind:'finding',data:{status:'Open',dueDate:'2024-05-31'}};
  const settings={daysBefore:3,startUnit:'months',repeatDaily:true,repeatEvery:1,repeatUnit:'months'};
  const slot=date=>service.reminderSlot(row,settings,new Date(`${date}T12:00:00`));
  assert.equal(slot('2024-02-28'),null);
  assert.equal(slot('2024-02-29'),'2024-02-29');
  assert.equal(slot('2024-03-30'),'2024-02-29');
  assert.equal(slot('2024-03-31'),'2024-03-31');
  assert.equal(slot('2024-05-15'),'2024-04-30');
  assert.equal(slot('2024-05-31'),'2024-05-31');
  assert.equal(slot('2024-06-01'),null);
  assert.equal(service.reminderSlot(row,{...settings,repeatUnit:'days',repeatEvery:7},new Date('2024-03-08T12:00:00')),'2024-03-07');
  assert.equal(service.reminderSlot({...row,data:{...row.data,dueDate:'2024-02-31'}},settings),null);
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
