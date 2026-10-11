const {pool}=require('../config/database');
const defaults={enabled:false,days:90};
async function ensureStore(){await pool.query(`CREATE TABLE IF NOT EXISTS audit_retention_settings(id INTEGER PRIMARY KEY CHECK(id=1),settings JSONB NOT NULL,last_cleanup_at TIMESTAMPTZ,last_deleted_count INTEGER NOT NULL DEFAULT 0)`);}
function validate(input){if(typeof input?.enabled!=='boolean'||!Number.isInteger(input.days)||input.days<1||input.days>36500)throw Object.assign(new Error('Retensi harus 1-36500 hari dan status aktivasi harus valid.'),{status:400});return {enabled:input.enabled,days:input.days};}
async function read(){await ensureStore();const row=(await pool.query('SELECT settings,last_cleanup_at AS "lastCleanupAt",last_deleted_count AS "lastDeletedCount" FROM audit_retention_settings WHERE id=1')).rows[0];return {...defaults,...row?.settings,lastCleanupAt:row?.lastCleanupAt||null,lastDeletedCount:row?.lastDeletedCount||0};}
async function save(input){const settings=validate(input);await ensureStore();await pool.query('INSERT INTO audit_retention_settings(id,settings) VALUES(1,$1) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings',[settings]);return read();}
async function cleanup(now=new Date()){
 const client=await pool.connect();try{await client.query('BEGIN');const lock=(await client.query('SELECT pg_try_advisory_xact_lock(872151) AS locked')).rows[0];if(!lock.locked){await client.query('COMMIT');return 0;}
 const row=(await client.query('SELECT settings FROM audit_retention_settings WHERE id=1 FOR SHARE')).rows[0];if(!row?.settings?.enabled){await client.query('COMMIT');return 0;}
 const settings=validate(row.settings),cutoff=new Date(now.getTime()-settings.days*86400000);
 const removed=await client.query('DELETE FROM audit_events WHERE id IN (SELECT id FROM audit_events WHERE created_at < $1 ORDER BY created_at,id LIMIT 10000)',[cutoff]);
 await client.query('UPDATE audit_retention_settings SET last_cleanup_at=$1,last_deleted_count=$2 WHERE id=1',[now,removed.rowCount]);
 if(removed.rowCount)await client.query(`INSERT INTO audit_events(request_id,actor_username,actor_role,event_type,method,path,details) VALUES('retention','system','system','audit.retention','SYSTEM','/api/audit/retention',$1)`,[{days:settings.days,deleted:removed.rowCount,cutoff:cutoff.toISOString()}]);
 await client.query('COMMIT');return removed.rowCount;
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
let timer;
function startScheduler(){if(timer)return;timer=setInterval(()=>cleanup().catch(error=>console.error('[audit-retention]',error.message)),3600000);timer.unref();}
module.exports={ensureStore,validate,read,save,cleanup,startScheduler};
