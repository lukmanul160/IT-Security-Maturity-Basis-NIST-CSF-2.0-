const {pool}=require('../config/database');
const assets=require('./assetManagementService');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const tables={assets:{table:'managed_asset_photos',column:'asset_id',parent:'managed_assets'},racks:{table:'asset_rack_photos',column:'rack_id',parent:'asset_racks'}};
let ready;
function ensureStore(){return ready||=(async()=>{
 await assets.ensureStore();
 for(const [key,value] of Object.entries(tables)){
  await pool.query(`CREATE TABLE IF NOT EXISTS ${value.table}(${value.column} UUID NOT NULL REFERENCES ${value.parent}(id) ON DELETE CASCADE,side TEXT NOT NULL CHECK(side IN ('front','rear')),mime_type TEXT NOT NULL,content BYTEA NOT NULL CHECK(octet_length(content)<=5242880),version UUID NOT NULL,PRIMARY KEY(${value.column},side))`);
  await pool.query(`ALTER TABLE ${value.table} ADD COLUMN IF NOT EXISTS evidence_path TEXT`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${value.table}_evidence_path_idx ON ${value.table}(evidence_path)`);
  await pool.query(`UPDATE ${value.table} SET evidence_path='Asset Management/${key}/'||${value.column}||'/'||side||'/'||version||'/photo.'||CASE mime_type WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' ELSE 'jpg' END WHERE evidence_path IS NULL`);
  await pool.query(`INSERT INTO evidence_files(path,name,content,mime_type) SELECT evidence_path,split_part(evidence_path,'/',6),content,mime_type FROM ${value.table} ON CONFLICT(path) DO NOTHING`);
 }
 // Keep binary originals in the database even when file restore writes to external storage.
 await pool.query(`CREATE OR REPLACE FUNCTION sync_asset_uploaded_file() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' THEN
   DELETE FROM managed_asset_photos WHERE evidence_path=OLD.path;
   DELETE FROM asset_rack_photos WHERE evidence_path=OLD.path;
   RETURN OLD;
  END IF;
  IF NEW.content IS NOT NULL THEN
   UPDATE managed_asset_photos SET content=NEW.content,mime_type=NEW.mime_type,version=gen_random_uuid() WHERE evidence_path=NEW.path AND (content IS DISTINCT FROM NEW.content OR mime_type IS DISTINCT FROM NEW.mime_type);
   UPDATE asset_rack_photos SET content=NEW.content,mime_type=NEW.mime_type,version=gen_random_uuid() WHERE evidence_path=NEW.path AND (content IS DISTINCT FROM NEW.content OR mime_type IS DISTINCT FROM NEW.mime_type);
  END IF;
  RETURN NEW;
 END $$`);
 await pool.query(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='asset_uploaded_file_sync' AND tgrelid='evidence_files'::regclass) THEN CREATE TRIGGER asset_uploaded_file_sync AFTER INSERT OR UPDATE OR DELETE ON evidence_files FOR EACH ROW EXECUTE FUNCTION sync_asset_uploaded_file(); END IF; END $$`);
})().catch(e=>{ready=null;throw e;});}
function validateFile(file){
 if(!file||!Buffer.isBuffer(file.buffer)||!file.buffer.length||file.buffer.length>5*1024*1024)throw fail('Foto maksimum 5 MB per sisi.');
 const b=file.buffer;let type;
 if(b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&b.subarray(12,16).toString()==='IHDR'&&b.readUInt32BE(16)>0&&b.readUInt32BE(20)>0)type='image/png';
 else if(b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255&&b[b.length-2]===255&&b[b.length-1]===217)type='image/jpeg';
 else if(b.length>=20&&b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(b.subarray(12,16).toString()))type='image/webp';
 if(!type||type!==file.mimetype)throw fail('Gunakan foto PNG, JPEG, atau WebP yang valid.');
 return {type,buffer:b};
}
function kind(value){if(!tables[value])throw fail('Jenis foto tidak valid.');return tables[value];}
function side(value){if(!['front','rear'].includes(value))throw fail('Sisi foto tidak valid.');return value;}
async function list(scope){await ensureStore();const result={assets:[],racks:[]};for(const [key,value] of Object.entries(tables)){if(scope&&scope!==key)continue;result[key]=(await pool.query(`SELECT ${value.column} AS owner_id,side,version FROM ${value.table}`)).rows;}return result;}
async function read(type,id,face){const value=kind(type);side(face);await ensureStore();const row=(await pool.query(`SELECT mime_type,content FROM ${value.table} WHERE ${value.column}=$1 AND side=$2`,[id,face])).rows[0];if(!row)throw fail('Foto tidak ditemukan.',404);return row;}
function prepareChanges(files,body,allowEmpty=false){
 const changes=[];
 for(const face of ['front','rear']){const file=files?.[face]?.[0],remove=body?.['remove'+(face==='front'?'Front':'Rear')];if(remove!==undefined&&!['true','false'].includes(remove))throw fail('Pilihan hapus foto tidak valid.');if(file&&remove==='true')throw fail('Pilih unggah atau hapus foto pada sisi yang sama.');if(file)changes.push({side:face,name:require('path').basename(file.originalname||'photo').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,200),...validateFile(file)});else if(remove==='true')changes.push({side:face,remove:true});}
 if(!changes.length&&!allowEmpty)throw fail('Pilih foto atau foto yang akan dihapus.');
 return changes;
}
async function applyChanges(c,type,id,changes,uploadedBy=null){
 const value=kind(type);
 for(const change of changes){
  if(change.remove){await c.query(`DELETE FROM ${value.table} WHERE ${value.column}=$1 AND side=$2`,[id,change.side]);continue;}
  const version=require('crypto').randomUUID(),extension=change.type==='image/png'?'png':change.type==='image/webp'?'webp':'jpg';
  const name=(change.name||'photo').replace(/\.[^.]*$/,'')+'.'+extension;
  const filePath=`Asset Management/${type}/${id}/${change.side}/${version}/${name}`;
  await c.query(`INSERT INTO evidence_files(path,name,content,mime_type,uploaded_by) VALUES($1,$2,$3,$4,$5)`,[filePath,name,change.buffer,change.type,uploadedBy]);
  await c.query(`INSERT INTO ${value.table}(${value.column},side,mime_type,content,version,evidence_path) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(${value.column},side) DO UPDATE SET mime_type=EXCLUDED.mime_type,content=EXCLUDED.content,version=EXCLUDED.version,evidence_path=EXCLUDED.evidence_path`,[id,change.side,change.type,change.buffer,version,filePath]);
 }
}
async function save(type,id,files,body,user){
 const value=kind(type),changes=prepareChanges(files,body);
 await ensureStore();const uploadedBy=user?await require('./evidenceAccessService').userId(user):null;const c=await pool.connect();
 try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(872146)');if(!(await c.query(`SELECT id FROM ${value.parent} WHERE id=$1 FOR UPDATE`,[id])).rowCount)throw fail('Aset/rak tidak ditemukan.',404);
 await applyChanges(c,type,id,changes,uploadedBy);
 await c.query('COMMIT');return {ok:true};}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
module.exports={ensureStore,validateFile,list,read,save,prepareChanges,applyChanges};
