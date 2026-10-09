const test=require('node:test'),assert=require('node:assert/strict');
const settings=require('../src/services/assetReminderSettingsService'),smtp=require('../src/services/smtpService'),{pool}=require('../src/config/database');
test('custom asset renewal templates render fields and reject malformed subjects or SMTP selections',()=>{
 const value={smtpAccountId:'default',subjectTemplate:'Renewal {{tag}} - {{name}}',bodyTemplate:'Halo {{owner}}, {{renewalDate}} di {{location}}'};
 assert.deepEqual(settings.renderMessage(settings.validate(value),{tag:'FW-01',name:'Firewall',owner:'Network',renewalDate:'2027-01-01',location:'DC'}),{subject:'Renewal FW-01 - Firewall',text:'Halo Network, 2027-01-01 di DC'});
 assert.throws(()=>settings.validate({...value,subjectTemplate:'Bad\nSubject'}),/tidak valid/);assert.throws(()=>settings.validate({...value,bodyTemplate:''}),/tidak valid/);assert.throws(()=>settings.validate({...value,smtpAccountId:'bad'}),/SMTP/);
});
test('selected SMTP and custom messages persist without storing account credentials',async()=>{
 const original={query:pool.query,get:smtp.getSettings,list:smtp.listAccounts};let saved;const id='11111111-1111-4111-8111-111111111111';
 pool.query=async(sql,args)=>{if(sql.startsWith('INSERT'))saved=args[0];return {rows:sql.startsWith('SELECT')&&saved?[{settings:saved}]:[]};};smtp.getSettings=async account=>{assert.equal(account,id);return {configured:true,password:'secret'};};smtp.listAccounts=async()=>[{id,name:'Renewal SMTP',configured:true}];
 try{const result=await settings.saveSettings({smtpAccountId:id,subjectTemplate:'{{tag}}',bodyTemplate:'{{name}}',password:'discard'});assert.deepEqual(Object.keys(saved).sort(),['bodyTemplate','smtpAccountId','subjectTemplate']);assert.equal(result.smtpAccountId,id);assert.equal(result.smtpConfigured,true);assert.equal(result.password,undefined);}finally{pool.query=original.query;smtp.getSettings=original.get;smtp.listAccounts=original.list;}
});
test('asset renewal scheduler uses selected SMTP and the custom message',async()=>{
 const service=require('../src/services/assetManagementService');const original={query:pool.query,connect:pool.connect,read:settings.read,create:smtp.createMailer,send:smtp.send};let selected,message,closed=false;
 const asset={tag:'FW-01',name:'Firewall',owner:'Network',ownerEmail:'owner@example.com',type:'Firewall',status:'in-use',reminderEnabled:true,reminderDays:30,renewalDate:'2020-01-01'};
 pool.query=async(sql)=>({rows:sql.startsWith('SELECT a.id, a.data')?[{id:'a',data:asset}]:[],rowCount:0});pool.connect=async()=>({release(){},query:async sql=>({rows:sql.includes('pg_try_advisory_lock')?[{locked:true}]:[],rowCount:0})});settings.read=async()=>({smtpAccountId:'selected',subjectTemplate:'Renewal {{tag}}',bodyTemplate:'Halo {{owner}}: {{renewalDate}}'});smtp.createMailer=async id=>{selected=id;return {from:'sender@example.com',mailer:{close(){closed=true;}}};};smtp.send=async(mailer,data)=>{message=data;};
 try{await service.runReminders();assert.equal(selected,'selected');assert.equal(message.to,'owner@example.com');assert.equal(message.subject,'Renewal FW-01');assert.equal(message.text,'Halo Network: 2020-01-01');assert.equal(closed,true);}finally{pool.query=original.query;pool.connect=original.connect;settings.read=original.read;smtp.createMailer=original.create;smtp.send=original.send;}
});
