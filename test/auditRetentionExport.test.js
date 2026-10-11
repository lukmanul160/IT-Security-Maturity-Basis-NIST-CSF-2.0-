const test=require('node:test'),assert=require('node:assert/strict');
const retention=require('../src/services/auditRetentionService'),audit=require('../src/services/auditService'),{pool}=require('../src/config/database');
test('retention validates explicit activation and duration; client detection is derived from user agent',()=>{
 for(const data of [{enabled:true,days:0},{enabled:true,days:1.5},{enabled:'true',days:30}])assert.throws(()=>retention.validate(data),{status:400});
 assert.deepEqual(retention.validate({enabled:false,days:90}),{enabled:false,days:90});
 assert.equal(audit.describeClient('').browser,'Tidak tersedia');
 const client=audit.describeClient('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36 Edg/120.0');assert.equal(client.browser,'Edge 120.0');assert.match(client.device,/Windows/);
 assert.match(audit.describeClient('Mozilla/5.0 (Linux; Android 13) Mobile Chrome/120.0').device,/Mobile - Android/);
 assert.equal(audit.csvCell('=malicious'),"\"'=malicious\"");
});
test('retention deletes only expired records when enabled; exports honor filters with client metadata',async t=>{
 const client=await pool.connect();try{
 await client.query('CREATE TEMP TABLE audit_retention_settings(id INTEGER PRIMARY KEY,settings JSONB,last_cleanup_at TIMESTAMPTZ,last_deleted_count INTEGER DEFAULT 0)');
 await client.query(`CREATE TEMP TABLE audit_events(id BIGSERIAL PRIMARY KEY,request_id TEXT,actor_username TEXT,actor_role TEXT,event_type TEXT,method TEXT,path TEXT,status_code INTEGER DEFAULT 200,ip_address TEXT,user_agent TEXT,duration_ms INTEGER,details JSONB,created_at TIMESTAMPTZ DEFAULT NOW())`);
 t.mock.method(pool,'query',client.query.bind(client));t.mock.method(pool,'connect',async()=>({query:client.query.bind(client),release(){}}));
 await client.query(`INSERT INTO audit_events(request_id,actor_username,event_type,method,path,ip_address,user_agent,details,created_at) VALUES('old','alice','data.read','GET','/old','127.0.0.1','Chrome/120.0','{}','2026-08-01'),('recent','alice','data.read','GET','/recent','127.0.0.2','Firefox/120.0','{}','2026-10-10'),('other','bob','data.read','GET','/other','127.0.0.3','','{}','2026-10-10')`);
 assert.equal((await retention.read()).enabled,false);assert.equal(await retention.cleanup(new Date('2026-10-11T00:00:00Z')),0);
 await retention.save({enabled:true,days:30});assert.equal(await retention.cleanup(new Date('2026-10-11T00:00:00Z')),1);
 assert.equal((await audit.list({actor:'alice'})).length,1);assert.equal((await retention.read()).lastDeletedCount,1);
 let csv='';for await(const chunk of audit.exportChunks({actor:'alice'},'csv'))csv+=chunk;assert.match(csv,/Device/);assert.match(csv,/Browser/);assert.match(csv,/Firefox 120.0/);assert.match(csv,/127.0.0.2/);assert.doesNotMatch(csv,/bob/);
 let json='';for await(const chunk of audit.exportChunks({actor:'alice'},'json'))json+=chunk;assert.equal(JSON.parse(json).length,1);assert.equal(JSON.parse(json)[0].requestId,'recent');
 await client.query(`INSERT INTO audit_events(request_id,actor_username,event_type,created_at,details) SELECT 'batch-'||n,'batch-owner','data.read','2026-10-10'::timestamptz,'{}'::jsonb FROM generate_series(1,510) n`);
 let batched='';for await(const chunk of audit.exportChunks({actor:'batch-owner'},'json'))batched+=chunk;assert.equal(JSON.parse(batched).length,510);assert.equal(new Set(JSON.parse(batched).map(row=>row.id)).size,510);
 await retention.save({enabled:false,days:1});assert.equal(await retention.cleanup(new Date('2026-12-01T00:00:00Z')),0);
 }finally{client.release(true);await pool.end();}
});

test('retention and log export remain admin-only',async()=>{
 const app=require('express')();app.use(require('express').json());app.use((req,res,next)=>{req.user={role:'viewer'};next();});app.use('/audit',require('../src/routes/auditRoutes'));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try{const base='http://127.0.0.1:'+server.address().port;for(const [path,method] of [['retention','GET'],['retention','PUT'],['export?format=csv','GET']]){const response=await fetch(base+'/audit/'+path,{method});assert.equal(response.status,403);}}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
