const test=require('node:test'),assert=require('node:assert/strict');
const settings=require('../src/services/assetReminderSettingsService'),smtp=require('../src/services/smtpService'),{pool}=require('../src/config/database');
test('H-30 every five days has matching slots in assets, policy and audit',()=>{
 const {scheduleSlot}=require('../src/services/reminderSchedule');
 const audit=require('../src/services/auditFindingReminderService');
 const schedule={useAssetDays:false,daysBefore:30,startUnit:'days',repeatDaily:true,repeatEvery:5,repeatUnit:'days',maxDeliveries:7,continueOverdue:false};
 const asset={reminderEnabled:true,ownerEmail:'owner@example.com',status:'in-use',reminderDays:7,renewalDate:'2026-11-30'};
 for(const [day,slot] of [['2026-10-30',null],['2026-10-31','2026-10-31'],['2026-11-04','2026-10-31'],['2026-11-05','2026-11-05'],['2026-11-10','2026-11-10'],['2026-11-15','2026-11-15'],['2026-11-20','2026-11-20'],['2026-11-25','2026-11-25'],['2026-11-30','2026-11-30'],['2026-12-01',null]]){
  const now=new Date(day+'T12:00:00');
  assert.equal(settings.reminderSlot(asset,schedule,now),slot);
  assert.equal(scheduleSlot(asset.renewalDate,schedule,now),slot);
  assert.equal(audit.reminderSlot({kind:'finding',data:{status:'Open',dueDate:asset.renewalDate}},schedule,now),slot);
 }
 assert.equal(settings.reminderSlot(asset,{...schedule,useAssetDays:true},new Date('2026-11-22T12:00:00')),null);
 for(const change of [{repeatEvery:0},{repeatEvery:1.5},{maxDeliveries:0},{daysBefore:37,startUnit:'months'},{continueOverdue:'yes'},{useAssetDays:'yes'}])assert.throws(()=>settings.validate({...settings.defaults,...change}),{status:400});
});
test('asset delivery history prevents hourly duplicates, honors five-day intervals and maximum count',async t=>{
 const service=require('../src/services/assetManagementService');
 const asset={id:'asset-slot-test',tag:'FW-01',name:'Firewall',owner:'Owner',ownerEmail:'owner@example.com',status:'in-use',reminderEnabled:true,reminderDays:30,renewalDate:'2026-11-30'};
 const saved={...settings.defaults,useAssetDays:false,repeatEvery:5,maxDeliveries:2,continueOverdue:false};
 const history=[];let sent=0;
 t.mock.method(pool,'query',async sql=>({rows:sql.startsWith('SELECT a.id, a.data')?[{id:asset.id,data:asset}]:[],rowCount:0}));
 t.mock.method(pool,'connect',async()=>({release(){},query:async(sql,args)=>{
  if(sql.includes('pg_try_advisory_lock'))return {rows:[{locked:true}]};
  if(sql.startsWith('SELECT COUNT'))return {rows:[{count:history.length,sent_in_slot:history.some(day=>day>=args[3])}]};
  if(sql.startsWith('INSERT INTO asset_renewal_deliveries'))history.push(args[3]);
  return {rows:[],rowCount:0};
 }}));
 t.mock.method(settings,'read',async()=>saved);
 t.mock.method(smtp,'createMailer',async()=>({from:'sender@example.com',mailer:{close(){}}}));
 t.mock.method(smtp,'send',async()=>{sent++;});
 for(const day of ['2026-10-31','2026-10-31','2026-11-01','2026-11-04','2026-11-05','2026-11-06','2026-11-10'])await service.runReminders(new Date(day+'T12:00:00+07:00'));
 assert.equal(sent,2);assert.deepEqual(history,['2026-10-31','2026-11-05']);
});
test('custom asset renewal templates render fields and reject malformed subjects or SMTP selections',()=>{
 const value={smtpAccountId:'default',subjectTemplate:'Renewal {{tag}} - {{name}}',bodyTemplate:'Halo {{owner}}, {{renewalDate}} di {{location}}'};
 assert.deepEqual(settings.renderMessage(settings.validate(value),{tag:'FW-01',name:'Firewall',owner:'Network',renewalDate:'2027-01-01',location:'DC'}),{subject:'Renewal FW-01 - Firewall',text:'Halo Network, 2027-01-01 di DC'});
 assert.throws(()=>settings.validate({...value,subjectTemplate:'Bad\nSubject'}),/tidak valid/);assert.throws(()=>settings.validate({...value,bodyTemplate:''}),/tidak valid/);assert.throws(()=>settings.validate({...value,smtpAccountId:'bad'}),/SMTP/);
});
test('selected SMTP and custom messages persist without storing account credentials',async()=>{
 const original={query:pool.query,get:smtp.getSettings,list:smtp.listAccounts};let saved;const id='11111111-1111-4111-8111-111111111111';
 pool.query=async(sql,args)=>{if(sql.startsWith('INSERT'))saved=args[0];return {rows:sql.startsWith('SELECT')&&saved?[{settings:saved}]:[]};};smtp.getSettings=async account=>{assert.equal(account,id);return {configured:true,password:'secret'};};smtp.listAccounts=async()=>[{id,name:'Renewal SMTP',configured:true}];
 try{const result=await settings.saveSettings({smtpAccountId:id,subjectTemplate:'{{tag}}',bodyTemplate:'{{name}}',password:'discard'});assert.deepEqual(Object.keys(saved).sort(),[...Object.keys(settings.scheduleDefaults),'bodyTemplate','smtpAccountId','subjectTemplate'].sort());assert.equal(result.smtpAccountId,id);assert.equal(result.smtpConfigured,true);assert.equal(result.password,undefined);}finally{pool.query=original.query;smtp.getSettings=original.get;smtp.listAccounts=original.list;}
});
test('asset renewal scheduler uses selected SMTP and the custom message',async()=>{
 const service=require('../src/services/assetManagementService');const original={query:pool.query,connect:pool.connect,read:settings.read,create:smtp.createMailer,send:smtp.send};let selected,message,closed=false;
 const asset={tag:'FW-01',name:'Firewall',owner:'Network',ownerEmail:'owner@example.com',type:'Firewall',status:'in-use',reminderEnabled:true,reminderDays:30,renewalDate:'2020-01-01'};
 pool.query=async(sql)=>({rows:sql.startsWith('SELECT a.id, a.data')?[{id:'a',data:asset}]:[],rowCount:0});pool.connect=async()=>({release(){},query:async sql=>({rows:sql.includes('pg_try_advisory_lock')?[{locked:true}]:[],rowCount:0})});settings.read=async()=>({smtpAccountId:'selected',subjectTemplate:'Renewal {{tag}}',bodyTemplate:'Halo {{owner}}: {{renewalDate}}'});smtp.createMailer=async id=>{selected=id;return {from:'sender@example.com',mailer:{close(){closed=true;}}};};smtp.send=async(mailer,data)=>{message=data;};
 try{await service.runReminders();assert.equal(selected,'selected');assert.equal(message.to,'owner@example.com');assert.equal(message.subject,'Renewal FW-01');assert.equal(message.text,'Halo Network: 2020-01-01');assert.equal(closed,true);}finally{pool.query=original.query;pool.connect=original.connect;settings.read=original.read;smtp.createMailer=original.create;smtp.send=original.send;}
});
