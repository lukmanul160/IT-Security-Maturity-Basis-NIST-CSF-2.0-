const {pool}=require('../config/database');

const smtp=require('./smtpService');

let ready;

function ensureStore(){if(!ready)ready=pool.query(`CREATE TABLE IF NOT EXISTS reminder_recipient_register(owner_key TEXT PRIMARY KEY, owner TEXT NOT NULL,email TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(error=>{ready=null;throw error;});return ready;}

function validate(data){const owner=String(data?.owner||'').trim(),email=String(data?.email||'').trim().toLowerCase();if(!owner||owner.length>160||(email&&!smtp.email(email))||email.length>254)throw Object.assign(new Error('Isi nama/jabatan dan alamat email yang valid.'),{status:400});return {owner,email};}

async function list(){await ensureStore();return (await pool.query('SELECT owner,email FROM reminder_recipient_register ORDER BY lower(owner)')).rows;}

async function save(input){const data=validate(input);await ensureStore();return (await pool.query('INSERT INTO reminder_recipient_register(owner_key,owner,email) VALUES($1,$2,$3) ON CONFLICT(owner_key) DO UPDATE SET owner=EXCLUDED.owner,email=EXCLUDED.email,updated_at=NOW() RETURNING owner,email',[data.owner.toLowerCase(),data.owner,data.email])).rows[0];}

function ownerKey(owner){const value=String(owner||'').trim();if(!value||value.length>160)throw Object.assign(new Error('Nama penerima tidak valid.'),{status:400});return value.toLowerCase();}
async function create(input){const data=validate(input);await ensureStore();try{return (await pool.query('INSERT INTO reminder_recipient_register(owner_key,owner,email) VALUES($1,$2,$3) RETURNING owner,email',[data.owner.toLowerCase(),data.owner,data.email])).rows[0];}catch(error){if(error.code==='23505')throw Object.assign(new Error('Nama penerima sudah terdaftar. Gunakan Edit untuk memperbaruinya.'),{status:409});throw error;}}
async function update(owner,input){const key=ownerKey(owner),data=validate(input);await ensureStore();try{const result=await pool.query('UPDATE reminder_recipient_register SET owner_key=$2,owner=$3,email=$4,updated_at=NOW() WHERE owner_key=$1 RETURNING owner,email',[key,data.owner.toLowerCase(),data.owner,data.email]);if(!result.rows.length)throw Object.assign(new Error('Penerima tidak ditemukan.'),{status:404});return result.rows[0];}catch(error){if(error.code==='23505')throw Object.assign(new Error('Nama penerima sudah digunakan.'),{status:409});throw error;}}
async function remove(owner){await ensureStore();const result=await pool.query('DELETE FROM reminder_recipient_register WHERE owner_key=$1 RETURNING owner',[ownerKey(owner)]);if(!result.rows.length)throw Object.assign(new Error('Penerima tidak ditemukan.'),{status:404});}
async function registerOwners(owners){const records=new Map();for(const input of owners){const owner=String(typeof input==='string'?input:input?.owner||'').trim();if(!owner||owner.length>160)continue;const email=typeof input==='object'&&smtp.email(input.email)?input.email.trim().toLowerCase():'';const key=owner.toLowerCase();if(!records.has(key)||email)records.set(key,{owner,email});}await ensureStore();if(records.size)await pool.query("INSERT INTO reminder_recipient_register(owner_key,owner,email) SELECT lower(owner),owner,email FROM jsonb_to_recordset($1::jsonb) AS source(owner text,email text) ON CONFLICT(owner_key) DO NOTHING",[JSON.stringify([...records.values()])]);}
async function emailMap(client=pool){await ensureStore();const {rows}=await client.query('SELECT owner,email FROM reminder_recipient_register');return new Map(rows.filter(row=>row.owner&&(!row.email||smtp.email(row.email))).map(row=>[row.owner.trim().toLowerCase(),row.email]));}
module.exports={registerOwners,emailMap,ensureStore,validate,list,save,create,update,remove};
