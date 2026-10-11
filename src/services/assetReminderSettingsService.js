const {pool}=require('../config/database');
const smtp=require('./smtpService');
const {scheduleSlot,validateSchedule}=require('./reminderSchedule');
const scheduleDefaults={useAssetDays:true,daysBefore:30,startUnit:'days',repeatDaily:true,repeatEvery:1,repeatUnit:'days',maxDeliveries:366,continueOverdue:true};
const defaults={...scheduleDefaults,smtpAccountId:'default',subjectTemplate:'Renewal aset: {{tag}}',bodyTemplate:'Kepada {{owner}},\n\nAset: {{name}} ({{tag}})\nLayanan: {{service}}\nRenewal: {{renewalDate}}\n\nSegera lakukan review dan proses renewal melalui change/tiket ITSM.'};
let ready;
function ensureStore(){return ready ||= pool.query('CREATE TABLE IF NOT EXISTS asset_reminder_settings (id INTEGER PRIMARY KEY CHECK(id=1), settings JSONB NOT NULL)').catch(e=>{ready=null;throw e;});}
async function read(){await ensureStore();const result=await pool.query('SELECT settings FROM asset_reminder_settings WHERE id=1');return {...defaults,...result.rows[0]?.settings};}
async function getSettings(){const settings=await read();return {...settings,smtpAccounts:await smtp.listAccounts(),smtpConfigured:(await smtp.getSettings(settings.smtpAccountId)).configured};}
function validate(data){if(!data||typeof data!=='object'||Array.isArray(data))throw Object.assign(new Error('Pengaturan reminder tidak valid.'),{status:400});const schedule={...scheduleDefaults,...data};const settings={...validateSchedule(schedule),useAssetDays:schedule.useAssetDays,continueOverdue:schedule.continueOverdue,smtpAccountId:smtp.accountId(data.smtpAccountId)};if(typeof settings.useAssetDays!=='boolean'||typeof settings.continueOverdue!=='boolean')throw Object.assign(new Error('Pilihan jadwal aset tidak valid.'),{status:400});for(const [field,max] of [['subjectTemplate',250],['bodyTemplate',10000]]){const value=data[field];if(typeof value!=='string'||!value.trim()||value.length>max||(field==='subjectTemplate'&&/[\r\n]/.test(value)))throw Object.assign(new Error('Subjek atau pesan email tidak valid.'),{status:400});settings[field]=value;}return settings;}
async function saveSettings(data){const settings=validate({...await read(),...data});await smtp.getSettings(settings.smtpAccountId);await ensureStore();await pool.query('INSERT INTO asset_reminder_settings(id,settings) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings',[settings]);return getSettings();}
function renderMessage(settings,asset){const values=Object.fromEntries(['tag','name','owner','ownerEmail','service','renewalDate','vendor','model','location'].map(key=>[key,asset[key]??'']));const render=value=>value.replace(/{{(\w+)}}/g,(match,key)=>Object.hasOwn(values,key)?String(values[key]):match);return {subject:render(settings.subjectTemplate).replace(/[\r\n]/g,' '),text:render(settings.bodyTemplate)};}
function reminderSlot(asset,options,now=new Date()){
 if(!asset.reminderEnabled||!asset.ownerEmail||['retired','disposed'].includes(asset.status))return null;
 const settings={...scheduleDefaults,...options};
 if(settings.useAssetDays){settings.daysBefore=asset.reminderDays;settings.startUnit='days';}
 return scheduleSlot(asset.renewalDate,settings,now);
}
module.exports={scheduleDefaults,reminderSlot,defaults,ensureStore,read,getSettings,validate,saveSettings,renderMessage};
