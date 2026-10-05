const { pool } = require('../config/database');
const { randomUUID } = require('node:crypto');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function ensureStore(){await pool.query(`CREATE TABLE IF NOT EXISTS knowledge_note_images (
  id UUID PRIMARY KEY,path TEXT NOT NULL UNIQUE,folder TEXT NOT NULL DEFAULT '',mime_type TEXT NOT NULL,
  content BYTEA NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);}
function validate(image){
  if(!image||typeof image.path!=='string'||!image.path)throw fail('Path gambar wajib diisi.');
  require('./knowledgeNoteService').validateFolder(image.path);
  const content=image.content;
  if(!Buffer.isBuffer(content)||!content.length||content.length>10*1024*1024)throw fail('Gambar maksimal 10 MB.');
  const extension=image.path.split('.').pop().toLowerCase();
  let type;
  if(content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))type='image/png';
  else if(content[0]===255&&content[1]===216&&content[2]===255)type='image/jpeg';
  else if(['GIF87a','GIF89a'].includes(content.subarray(0,6).toString()))type='image/gif';
  else if(content.subarray(0,4).toString()==='RIFF'&&content.subarray(8,12).toString()==='WEBP')type='image/webp';
  if(!type||!({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp'}[extension]===type))throw fail('Gunakan gambar PNG, JPG, GIF, atau WEBP yang valid.');
  return {...image,type,folder:image.path.split('/').slice(0,-1).join('/')};
}
async function store(client,image){
  const value=validate(image),id=randomUUID();
  try{const result=await client.query('INSERT INTO knowledge_note_images(id,path,folder,mime_type,content) VALUES($1,$2,$3,$4,$5) RETURNING id,path',[id,value.path,value.folder,value.type,value.content]);return result.rows[0];}
  catch(error){if(error.code==='23505')throw fail('Gambar sudah ada: '+image.path,409);throw error;}
}
async function list(){return (await pool.query('SELECT id,path,mime_type AS type FROM knowledge_note_images ORDER BY path')).rows;}
async function read(id){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw fail('Gambar tidak ditemukan.',404);const row=(await pool.query('SELECT content,mime_type AS type FROM knowledge_note_images WHERE id=$1',[id])).rows[0];if(!row)throw fail('Gambar tidak ditemukan.',404);return row;}
module.exports={ensureStore,validate,store,list,read};
