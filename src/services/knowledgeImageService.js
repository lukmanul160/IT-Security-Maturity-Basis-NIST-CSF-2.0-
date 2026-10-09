const { pool } = require('../config/database');
const { randomUUID } = require('node:crypto');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
async function ensureStore(){await pool.query(`CREATE TABLE IF NOT EXISTS knowledge_note_images (
  id UUID PRIMARY KEY,path TEXT NOT NULL UNIQUE,folder TEXT NOT NULL DEFAULT '',mime_type TEXT NOT NULL,
  content BYTEA NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await pool.query('ALTER TABLE knowledge_note_images ADD COLUMN IF NOT EXISTS evidence_path TEXT');
 await pool.query('CREATE INDEX IF NOT EXISTS knowledge_note_images_evidence_path_idx ON knowledge_note_images(evidence_path)');
 await pool.query(`UPDATE knowledge_note_images SET evidence_path='Knowledge Notes/'||id||'/image.'||CASE mime_type WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'image/gif' THEN 'gif' ELSE 'jpg' END WHERE evidence_path IS NULL`);
 await pool.query(`INSERT INTO evidence_files(path,name,content,mime_type) SELECT evidence_path,regexp_replace(path,'^.*/',''),content,mime_type FROM knowledge_note_images ON CONFLICT(path) DO NOTHING`);
 await pool.query(`CREATE OR REPLACE FUNCTION sync_note_uploaded_file() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' THEN DELETE FROM knowledge_note_images WHERE evidence_path=OLD.path; RETURN OLD; END IF;
 IF NEW.content IS NOT NULL THEN UPDATE knowledge_note_images SET content=NEW.content,mime_type=NEW.mime_type WHERE evidence_path=NEW.path AND (content IS DISTINCT FROM NEW.content OR mime_type IS DISTINCT FROM NEW.mime_type); END IF;
 RETURN NEW; END $$`);
 await pool.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='note_uploaded_file_sync' AND tgrelid='evidence_files'::regclass) THEN CREATE TRIGGER note_uploaded_file_sync AFTER INSERT OR UPDATE OR DELETE ON evidence_files FOR EACH ROW EXECUTE FUNCTION sync_note_uploaded_file(); END IF; END $$`);
}
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
  try{
 const name=value.path.split('/').pop().replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,200),filePath=`Knowledge Notes/${id}/${name}`;
 await client.query('INSERT INTO evidence_files(path,name,content,mime_type,uploaded_by) VALUES($1,$2,$3,$4,$5)',[filePath,name,value.content,value.type,value.uploadedBy||null]);
 const result=await client.query('INSERT INTO knowledge_note_images(id,path,folder,mime_type,content,evidence_path) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,path',[id,value.path,value.folder,value.type,value.content,filePath]);return result.rows[0];}

  catch(error){if(error.code==='23505')throw fail('Gambar sudah ada: '+image.path,409);throw error;}
}
async function list(){return (await pool.query('SELECT id,path,mime_type AS type FROM knowledge_note_images ORDER BY path')).rows;}
async function read(id){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw fail('Gambar tidak ditemukan.',404);const row=(await pool.query('SELECT content,mime_type AS type FROM knowledge_note_images WHERE id=$1',[id])).rows[0];if(!row)throw fail('Gambar tidak ditemukan.',404);return row;}
function validateId(id){if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw fail('Gambar tidak ditemukan.',404);}
async function move(id,folder){
 validateId(id);require('./knowledgeNoteService').validateFolder(folder);
 if(typeof folder!=='string')throw fail('Folder tujuan wajib diisi.');
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('LOCK TABLE knowledge_note_folders, knowledge_notes, knowledge_note_images IN SHARE ROW EXCLUSIVE MODE');
  const images=(await client.query('SELECT id,path FROM knowledge_note_images')).rows;
  const image=images.find(image=>image.id===id);if(!image)throw fail('Gambar tidak ditemukan.',404);
  const path=[folder,image.path.split('/').pop()].filter(Boolean).join('/');
  require('./knowledgeNoteService').validateFolder(path);
  if(images.some(image=>image.id!==id&&image.path===path))throw fail('Gambar dengan nama yang sama sudah ada di folder tujuan.',409);
  const parts=folder.split('/').filter(Boolean);
  for(let i=1;i<=parts.length;i++)await client.query('INSERT INTO knowledge_note_folders(path) VALUES($1) ON CONFLICT DO NOTHING',[parts.slice(0,i).join('/')]);
  if(path!==image.path){
   const {moveImageReferences}=await import('../../frontend/client/src/workspace/features/shared/noteImages.mjs');
   for(const note of (await client.query('SELECT id,content,folder FROM knowledge_notes')).rows){
    const content=moveImageReferences(note.content,images,id,path,note.folder);
    if(content!==note.content)await client.query('UPDATE knowledge_notes SET content=$2,version=version+1,updated_at=NOW() WHERE id=$1',[note.id,content]);
   }
  }
  const saved=(await client.query('UPDATE knowledge_note_images SET path=$2,folder=$3 WHERE id=$1 RETURNING id,path,mime_type AS type',[id,path,folder])).rows[0];
  await client.query('COMMIT');return saved;
 }catch(error){await client.query('ROLLBACK');if(error.code==='23505')throw fail('Gambar dengan nama yang sama sudah ada di folder tujuan.',409);throw error;}finally{client.release();}
}
async function remove(id){validateId(id);if(!(await pool.query('DELETE FROM knowledge_note_images WHERE id=$1',[id])).rowCount)throw fail('Gambar tidak ditemukan.',404);}
module.exports={ensureStore,validate,store,list,read,move,remove};
