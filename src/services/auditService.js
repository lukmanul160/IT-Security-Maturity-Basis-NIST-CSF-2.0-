const { pool } = require('../config/database');

async function ensureStore() {
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_events (
    id BIGSERIAL PRIMARY KEY,
    request_id TEXT NOT NULL,
    actor_username TEXT NOT NULL DEFAULT '',
    actor_role TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL DEFAULT 200,
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    duration_ms INTEGER NOT NULL DEFAULT 0,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events (created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_username, created_at DESC)');
  await pool.query('CREATE INDEX IF NOT EXISTS audit_events_request_idx ON audit_events (request_id)');
}

async function record(event) {
  await pool.query(`INSERT INTO audit_events
    (request_id, actor_username, actor_role, event_type, method, path, status_code, ip_address, user_agent, duration_ms, details)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [
    event.requestId || '', event.actorUsername || '', event.actorRole || '', event.eventType || 'request',
    event.method || '', event.path || '', Number(event.statusCode) || 500, event.ipAddress || '',
    event.userAgent || '', Number(event.durationMs) || 0, JSON.stringify(event.details || {})
  ]);
}

async function list({ limit = 100, offset = 0, actor = '', eventType = '', from = '', to = '', before = null } = {}) {
  const values = [];
  const filters = [];
  if (actor) { values.push(String(actor)); filters.push(`actor_username = $${values.length}`); }
  if (eventType) { values.push(String(eventType)); filters.push(`event_type = $${values.length}`); }
  for (const [value, operator] of [[from, '>='], [to, '<=']]) {
    if (!value) continue;
    if (!Number.isFinite(Date.parse(value))) throw Object.assign(new Error('Tanggal audit tidak valid'), { status: 400 });
    values.push(new Date(value).toISOString()); filters.push(`created_at ${operator} $${values.length}::timestamptz`);
  }
  if(before){values.push(before.createdAt,before.id);filters.push(`(created_at,id) < ($${values.length-1}::timestamptz,$${values.length}::bigint)`);}
  values.push(Math.min(500, Math.max(1, Number(limit) || 100)));
  values.push(Math.max(0, Number(offset) || 0));
  const result = await pool.query(`SELECT id, request_id AS "requestId", actor_username AS "actorUsername", actor_role AS "actorRole", event_type AS "eventType", method, path, status_code AS "statusCode", ip_address AS "ipAddress", user_agent AS "userAgent", duration_ms AS "durationMs", details, created_at AS "createdAt" FROM audit_events ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
  return result.rows.map(row=>({...row,...describeClient(row.userAgent)}));
}

async function listRiskAcceptance(id, offset = 0) {
  if (!/^\d+$/.test(String(id))) throw Object.assign(new Error('ID pengajuan tidak valid'), { status: 400 });
  const result = await pool.query(`SELECT id, request_id AS "requestId", actor_username AS "actorUsername", actor_role AS "actorRole", event_type AS "eventType", method, path, status_code AS "statusCode", ip_address AS "ipAddress", details, created_at AS "createdAt"
    FROM audit_events
    WHERE path IN ($1, $2)
      OR (path = '/api/risk-acceptance' AND method = 'POST' AND details->'response'->>'id' = $3)
    ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET $4`,
    [`/api/risk-acceptance/${id}`, `/api/risk-acceptance/${id}/export/pdf`, String(id), Math.max(0, Math.floor(Number(offset) || 0))]);
  return result.rows;
}

function describeClient(userAgent=''){
 const ua=String(userAgent||'');let browser='Tidak tersedia';
 for(const [name,pattern] of [['Edge',/Edg(?:e|A|iOS)?\/([\d.]+)/],['Opera',/OPR\/([\d.]+)/],['Firefox',/(?:Firefox|FxiOS)\/([\d.]+)/],['Chrome',/(?:Chrome|CriOS)\/([\d.]+)/],['Safari',/Version\/([\d.]+).*Safari/]]){const match=ua.match(pattern);if(match){browser=name+' '+match[1];break;}}
 const platform=/Android/i.test(ua)?'Android':/iPhone|iPad|iPod/i.test(ua)?'iOS':/Windows/i.test(ua)?'Windows':/Macintosh|Mac OS/i.test(ua)?'macOS':/Linux/i.test(ua)?'Linux':ua?'Platform tidak diketahui':'Tidak tersedia';
 const kind=/iPad|Tablet/i.test(ua)?'Tablet':/Mobile|iPhone|iPod/i.test(ua)?'Mobile':ua?'Desktop / client':'Tidak tersedia';return {device:ua?kind+' - '+platform:'Tidak tersedia',browser};
}
const exportColumns=[['Timestamp',r=>new Date(r.createdAt).toISOString()],['Actor',r=>r.actorUsername],['Role',r=>r.actorRole],['Event',r=>r.eventType],['Method',r=>r.method],['Path',r=>r.path],['Status',r=>r.statusCode],['IP',r=>r.ipAddress],['Device',r=>r.device],['Browser',r=>r.browser],['User agent',r=>r.userAgent],['Duration ms',r=>r.durationMs],['Request ID',r=>r.requestId],['Details',r=>JSON.stringify(r.details)]];
function csvCell(value){let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
async function* exportChunks(filters={},format='csv'){
 if(!['csv','json'].includes(format))throw Object.assign(new Error('Format export harus CSV atau JSON.'),{status:400});
 for(const value of [filters.from,filters.to])if(value&&!Number.isFinite(Date.parse(value)))throw Object.assign(new Error('Tanggal audit tidak valid'),{status:400});
 const snapshot=new Date().toISOString();const to=filters.to&&new Date(filters.to)<new Date(snapshot)?filters.to:snapshot;
 // Fetch the first page before emitting headers, so invalid filters return an HTTP error.
 let page=await list({...filters,to,limit:500,offset:0,before:null}),first=true;
 yield format==='csv'?'\uFEFF'+exportColumns.map(([title])=>csvCell(title)).join(',')+'\r\n':'[';
 while(page.length){for(const row of page){yield format==='csv'?exportColumns.map(([,get])=>csvCell(get(row))).join(',')+'\r\n':(first?'':',')+JSON.stringify(row);first=false;}
 const last=page.at(-1);page=await list({...filters,to,limit:500,offset:0,before:{createdAt:last.createdAt,id:last.id}});}
 if(format==='json')yield ']';
}
module.exports = { ensureStore, record, list, listRiskAcceptance,describeClient,csvCell,exportChunks };
