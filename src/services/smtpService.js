const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const nodemailer = require('nodemailer');
const { pool } = require('../config/database');
const { dataRoot } = require('../config/paths');
const defaults = { host: '', port: 587, security: 'starttls', username: '', from: '' };
const invalid = message => Object.assign(new Error(message), { status: 400 });
const email = value => typeof value === 'string' && /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
async function key() {
  const filename = path.join(dataRoot, 'smtp-secret.key');
  await fs.mkdir(dataRoot, { recursive: true });
  try { await fs.writeFile(filename, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return fs.readFile(filename);
}
async function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', await key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64')).join('.');
}
async function decrypt(value) {
  if (!value) return '';
  const [iv, tag, content] = value.split('.').map(part => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', await key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8');
}
async function transport(settings, secret) {
  if (!settings.host || !email(settings.from)) throw invalid('Simpan host SMTP dan email pengirim terlebih dahulu.');
  return nodemailer.createTransport({ host: settings.host, port: settings.port, secure: settings.security === 'tls', requireTLS: settings.security === 'starttls', auth: settings.username ? { user: settings.username, pass: await decrypt(secret) } : undefined, connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000, disableFileAccess: true, disableUrlAccess: true });
}
async function send(transport, message) {
  try {
    const result = await transport.sendMail(message);
    if (!result.accepted?.length || result.rejected?.length) throw new Error('Recipient rejected');
  } catch { throw Object.assign(new Error('Email gagal dikirim. Periksa host, port, TLS, kredensial, dan izin relay SMTP.'), { status: 502 }); }
}
async function ensureStore() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS app_smtp_settings (id INTEGER PRIMARY KEY CHECK (id = 1), settings JSONB NOT NULL, secret TEXT NOT NULL DEFAULT '')`);
    // Called after the legacy policy table is ensured. Copy ciphertext unchanged; its key stays the same.
    await client.query(`INSERT INTO app_smtp_settings (id, settings, secret)
      SELECT 1, jsonb_build_object('host', COALESCE(settings->>'host', ''), 'port', COALESCE((settings->>'port')::int, 587),
        'security', COALESCE(settings->>'security', 'starttls'), 'username', COALESCE(settings->>'username', ''), 'from', COALESCE(settings->>'from', '')), secret
      FROM policy_reminder_settings WHERE id = 1 ON CONFLICT (id) DO NOTHING`);
    await client.query(`UPDATE policy_reminder_settings SET settings = settings - ARRAY['host','port','security','username','from'], secret = ''
      WHERE id = 1 AND EXISTS (SELECT 1 FROM app_smtp_settings WHERE id = 1)`);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
async function read() {
  const result = await pool.query('SELECT settings, secret FROM app_smtp_settings WHERE id = 1');
  return { settings: { ...defaults, ...result.rows[0]?.settings }, secret: result.rows[0]?.secret || '' };
}
async function getSettings() {
  const {settings,secret} = await read();
  return {...settings,hasPassword:Boolean(secret),configured:Boolean(settings.host && email(settings.from))};
}
function validate(data) {
  const settings = {};
  for (const field of ['host','username','from']) {
    if (typeof data[field] !== 'string' || /[\r\n]/.test(data[field]) || data[field].length > 254) throw invalid(`${field} tidak valid.`);
    settings[field] = data[field].trim();
  }
  if (settings.from && !email(settings.from)) throw invalid('Email pengirim tidak valid.');
  if (!Number.isInteger(data.port) || data.port < 1 || data.port > 65535) throw invalid('Port tidak valid.');
  if (!['tls','starttls'].includes(data.security)) throw invalid('Pilih STARTTLS atau TLS.');
  if (data.password !== undefined && (typeof data.password !== 'string' || data.password.length > 4096)) throw invalid('Password tidak valid.');
  return {...settings,port:data.port,security:data.security};
}
async function saveSettings(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid('Pengaturan SMTP tidak valid.');
  const current = await read();
  const settings = validate({...current.settings,...data});
  const secret = data.clearPassword === true ? '' : data.password ? await encrypt(data.password) : current.secret;
  await pool.query(`INSERT INTO app_smtp_settings (id, settings, secret) VALUES (1, $1, $2)
    ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, secret = EXCLUDED.secret`, [settings,secret]);
  return getSettings();
}
async function createMailer() {
  const {settings,secret} = await read();
  return {mailer:await transport(settings,secret),from:settings.from};
}
async function testEmail(to) {
  if (!email(to)) throw invalid('Email tujuan tes tidak valid.');
  const {mailer,from} = await createMailer();
  try { await send(mailer,{from,to,subject:'NIST Basis — Tes koneksi SMTP',text:'Email percobaan dari pengaturan SMTP terpusat NIST Basis.'}); }
  finally { mailer.close?.(); }
  return {message:'Email tes diterima oleh server SMTP.'};
}
module.exports = {ensureStore,getSettings,saveSettings,validate,createMailer,send,testEmail,email};
