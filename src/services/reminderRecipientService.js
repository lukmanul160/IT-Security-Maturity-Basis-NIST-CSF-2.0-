const {pool}=require('../config/database');
const smtp=require('./smtpService');
let ready;
function ensureStore(){if(!ready)ready=pool.query(`CREATE TABLE IF NOT EXISTS reminder_recipient_register(owner_key TEXT PRIMARY KEY, owner TEXT NOT NULL,email TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(error=>{ready=null;throw error;});return ready;}
function validate(data){const owner=String(data?.owner||'').trim(),email=String(data?.email||'').trim().toLowerCase();if(!owner||owner.length>160||!smtp.email(email)||email.length>254)throw Object.assign(new Error('Isi nama/jabatan dan alamat email yang valid.'),{status:400});return {owner,email};}
async function list(){await ensureStore();return (await pool.query('SELECT owner,email FROM reminder_recipient_register ORDER BY lower(owner)')).rows;}
async function save(input){const data=validate(input);await ensureStore();return (await pool.query('INSERT INTO reminder_recipient_register(owner_key,owner,email) VALUES($1,$2,$3) ON CONFLICT(owner_key) DO UPDATE SET owner=EXCLUDED.owner,email=EXCLUDED.email,updated_at=NOW() RETURNING owner,email',[data.owner.toLowerCase(),data.owner,data.email])).rows[0];}
module.exports={ensureStore,validate,list,save};
