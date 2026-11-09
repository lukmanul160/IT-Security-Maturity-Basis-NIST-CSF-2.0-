// Never load installation credentials; PostgreSQL integration is isolated-runner only.
require('dotenv').config=()=>({parsed:{}});
const test=require('node:test'),assert=require('node:assert/strict');
const service=require('../src/services/technologyAssetService');
const scanner=require('../src/services/technologyHeaderScanService');
const {detect,detectPage}=require('../src/shared/technologyFingerprint');
const vulnerabilities=require('../src/services/technologyVulnerabilityService');
const {pool}=require('../src/config/database');
const permissions=require('../src/services/permissionService');
const tech=(name='PHP',version='8.2')=>({name,version,quadrant:'framework',ring:'assess',source:'manual',evidence:'',notes:''});
const application=()=>({name:'Aplikasi A',owner:'IT',url:'https://example.com',description:'Mapping fixture',version:0,technologies:[tech()]});
test('inventory validates versions independently, permits manual internal URLs, and rejects duplicate technology/version',()=>{
 const d=application();d.technologies.push(tech('PHP','8.3'));assert.equal(service.validate(d).technologies.length,2);
 assert.equal(service.validate({...d,url:'http://10.0.0.1'}).url,'http://10.0.0.1');
 for(const mutate of [d=>d.technologies.push(tech()),d=>d.name='',d=>d.url='file:///etc/passwd',d=>d.url='https://u:p@example.com',d=>d.technologies[0].ring='unknown',d=>d.version=-1]){const copy=application();mutate(copy);assert.throws(()=>service.validate(copy),{status:400});}
 assert.equal(permissions.canAccess('viewer','technology-asset','read'),true);assert.equal(permissions.canAccess('viewer','technology-asset','update'),false);
});
test('header fingerprints distinguish versions, proxies and unknown stacks without returning cookies',()=>{
 const found=detect({server:'nginx/1.24.0','x-powered-by':'PHP/8.2.4','set-cookie':'secret=fixture'});
 assert.equal(found.find(t=>t.name==='nginx').version,'1.24.0');assert.equal(found.find(t=>t.name==='PHP').version,'8.2.4');
 assert.deepEqual(detect({'cache-control':'no-cache'}),[]);assert.ok(found.every(t=>t.source==='header'&&t.ring==='assess'));
});
test('scanner accepts internal/public targets and blocks metadata, reserved, mapped and credentialed targets',async()=>{
 for(const ip of ['127.0.0.1','10.1.1.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','198.18.0.1','203.0.113.1','0.0.0.0','224.1.2.3','::1','::ffff:127.0.0.1','fe80::1','fc00::1','2001:db8::1','2002:7f00:1::'])assert.equal(scanner.publicAddress(ip),false,ip);
 for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(scanner.publicAddress(ip),true,ip);
 for(const url of ['http://2130706433','http://0x7f000001','http://localhost','file:///tmp/x','https://user:pass@example.com','http://100.100.100.200','http://168.63.129.16','http://[fd00:0ec2:0:0:0:0:0:0254]'])assert.throws(()=>scanner.validateUrl(url),{status:400});
 for(const ip of ['10.0.0.1','172.16.0.1','192.168.1.1','100.64.0.1','fd12:3456::1','8.8.8.8'])assert.equal(scanner.allowedAddress(ip),true,ip);
 for(const ip of ['100.100.100.200','168.63.129.16','fd00:ec2::254','169.254.169.254','127.0.0.1'])assert.equal(scanner.allowedAddress(ip),false,ip);
 assert.equal(scanner.validateUrl('http://10.0.0.1:8080').port,'8080');
 assert.equal((await scanner.target('http://app.intranet:8000',async()=>[{address:'192.168.1.10',family:4}])).scope,'internal');
 await assert.rejects(scanner.target('https://fixture.example',async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]),{status:400});
});
test('scan pins the resolved destination, rechecks redirects, preserves status and returns only safe headers',async()=>{
 let calls=0;
 const resolve=async()=>[{address:'8.8.8.8',family:4}];
 const result=await scanner.scan('https://fixture.example',{resolve,request:async destination=>{assert.equal(destination.address,'8.8.8.8');calls++;return {status:200,headers:{server:'nginx/1.24','x-powered-by':'Express','set-cookie':'secret'}};}});
 assert.equal(calls,1);assert.equal(result.technologies.length,2);assert.equal(result.headers['set-cookie'],undefined);
 await assert.rejects(scanner.scan('https://fixture.example',{resolve,request:async()=>({status:302,headers:{location:'http://169.254.169.254/latest'}})}),{status:400});
 let dnsCalls=0;
 await assert.rejects(scanner.scan('https://fixture.example',{resolve:async()=>[{address:++dnsCalls===1?'8.8.8.8':'10.0.0.1',family:4}],request:async()=>({status:302,headers:{location:'https://other.example'}})}),{status:400});
 await assert.rejects(scanner.scan('https://fixture.example',{resolve,request:async()=>({status:302,headers:{location:'/again'}})}),{status:502});
});
test('real HEAD transport uses the pinned fixture address and sends no cookies or authentication',async()=>{
 const http=require('node:http');let observed;
 const server=http.createServer((req,res)=>{observed={method:req.method,host:req.headers.host,cookie:req.headers.cookie,authorization:req.headers.authorization};res.setHeader('Server','nginx/fixture');res.end();});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await scanner.requestHeaders({url:new URL('http://fixture.invalid:'+server.address().port+'/headers'),address:'127.0.0.1',family:4});
  assert.equal(response.headers.server,'nginx/fixture');assert.equal(observed.method,'HEAD');assert.ok(observed.host.startsWith('fixture.invalid:'));assert.equal(observed.cookie,undefined);assert.equal(observed.authorization,undefined);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('page profiling detects generators, scripts, styles and cookie names with explicit versions only',()=>{
 const html=`<meta content="WordPress 6.6.2" name="generator"><script src="https://cdn.example/jquery/3.7.1/jquery.min.js?token=SECRET"></script>
 <link href="/bootstrap@5.3.3/dist/css/bootstrap.min.css?auth=SECRET" rel="stylesheet"><script src="/react@18.2.0/umd/react.production.min.js"></script>
 <div data-reactroot></div><script src="/vue@3.4.1/dist/vue.global.js"></script><div ng-version="17.2.0"></div><script src="/_next/static/chunk.js"></script>`;
 const found=detectPage({server:'nginx/1.24'},html,['laravel_session=SECRET; HttpOnly','PHPSESSID=SECRET; Secure']);
 for(const [name,version] of [['WordPress','6.6.2'],['jQuery','3.7.1'],['Bootstrap','5.3.3'],['React','18.2.0'],['Vue.js','3.4.1'],['Angular','17.2.0'],['Next.js',''],['Laravel',''],['PHP','']])assert.equal(found.find(row=>row.name===name)?.version,version,name);
 assert.ok(!JSON.stringify(found).includes('SECRET'));assert.ok(found.some(row=>row.source==='scan'));assert.equal(found.filter(row=>row.name==='React').length,1);
 assert.deepEqual(detectPage({},'<p>A plain page</p>',[]),[]);
});
test('internal DNS and custom web ports scan page hints while redirects to metadata are rejected',async()=>{
 const resolve=async()=>[{address:'10.20.30.40',family:4}];
 const result=await scanner.scan('http://erp.internal:8080',{resolve,request:async destination=>{
  assert.equal(destination.scope,'internal');assert.equal(destination.url.port,'8080');
  return {status:200,headers:{'set-cookie':['laravel_session=SECRET']},html:'<meta name="generator" content="WordPress 6.6.2">',htmlBytes:64};
 }});
 assert.equal(result.scope,'internal');assert.equal(result.technologies.find(row=>row.name==='WordPress').version,'6.6.2');assert.ok(!JSON.stringify(result).includes('SECRET'));
 await assert.rejects(scanner.scan('http://erp.internal:8080',{resolve,request:async()=>({status:302,headers:{location:'http://100.100.100.200/latest'}})}),{status:400});
});
test('real GET reads bounded HTML and gzip from a local fixture without exposing document secrets',async()=>{
 const http=require('node:http'),zlib=require('node:zlib');let method;
 const server=http.createServer((req,res)=>{
  method=req.method;res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/large'){res.end('<meta name="generator" content="WordPress 6.6.2">'+'a'.repeat(scanner.HTML_LIMIT+100));return;}
  res.setHeader('Content-Encoding','gzip');res.end(zlib.gzipSync('<script src="/jquery-3.7.1.min.js?auth=SECRET"></script>'));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const destination={url:new URL('http://fixture.invalid:'+server.address().port+'/gzip'),address:'127.0.0.1',family:4};
  const response=await scanner.requestPage(destination);assert.equal(method,'GET');assert.equal(detectPage({},response.html).find(row=>row.name==='jQuery').version,'3.7.1');
  destination.url.pathname='/large';const large=await scanner.requestPage(destination);assert.equal(large.htmlBytes,scanner.HTML_LIMIT);assert.equal(large.truncated,true);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('many-to-many graph identity shares B/C/D and separates different technology versions',async()=>{
 const {technologyMap,versionComparison,radarPoints}=await import('../frontend/client/src/services/technologyAssetModel.mjs');
 const rows=[{id:'a',data:{name:'Aplikasi A',technologies:['A','B','C','D'].map(name=>tech(name,'1'))}},{id:'b',data:{name:'Aplikasi B',technologies:['B','C','D','E'].map(name=>tech(name,'1'))}}];
 let nodes=technologyMap(rows);assert.equal(nodes.length,5);assert.equal(nodes.filter(n=>n.applications.length===2).length,3);
 rows[1].data.technologies[0].version='2';nodes=technologyMap(rows);assert.equal(nodes.length,6);assert.equal(versionComparison(nodes).find(n=>n.name==='B').different,true);
 rows[1].data.technologies[1].ring='hold';assert.equal(technologyMap(rows).find(n=>n.name==='C').ring,'hold');
 assert.ok(radarPoints(nodes).every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));
});
test('CVE keyword candidates preserve score, unknown severity and explicit no-safe-result semantics',async()=>{
 assert.throws(()=>vulnerabilities.validate({name:'PHP',version:''}),{status:400});
 const fixture={totalResults:1,vulnerabilities:[{cve:{id:'CVE-2026-12345',descriptions:[{lang:'en',value:'Fixture candidate, not a real advisory.'}],lastModified:'2026-11-01',published:'2026-10-01',metrics:{cvssMetricV31:[{cvssData:{baseScore:8.1,baseSeverity:'HIGH'}}]}}}]};
 let requested;
 const data=await vulnerabilities.lookup({name:'PHP',version:'8.2',recent:true},{now:()=>2000000000000,request:async url=>{requested=url;return fixture;}});
 assert.equal(requested.hostname,'services.nvd.nist.gov');assert.equal(requested.searchParams.get('keywordSearch'),'PHP 8.2');assert.ok(requested.searchParams.has('lastModStartDate'));assert.equal(data.items[0].score,8.1);
 const cached=await vulnerabilities.lookup({name:'PHP',version:'8.2',recent:true},{now:()=>2000000000100,request:async()=>{throw Error('must use cache');}});assert.equal(cached.cached,true);
 await assert.rejects(vulnerabilities.lookup({name:'PHP',version:'8.3'},{now:()=>2000000000200,request:async()=>fixture}),{status:429});
 assert.deepEqual(vulnerabilities.normalize({totalResults:0,vulnerabilities:[]}),[]);
});
test('temporary PostgreSQL CRUD preserves mappings and rejects stale updates/deletes; HTTP enforces actions', {skip:!process.env.NIST_TEST_ROOT},async()=>{
 const client=await pool.connect(),query=pool.query,connect=pool.connect;let server;
 try{
  await client.query('CREATE TEMP TABLE technology_assets(id UUID PRIMARY KEY,name TEXT,data JSONB,version INTEGER DEFAULT 1,updated_at TIMESTAMPTZ DEFAULT NOW()); CREATE TEMP TABLE role_permissions(role TEXT,permission_key TEXT,allowed BOOLEAN,actions JSONB,updated_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(role,permission_key))');
  pool.query=(sql,...args)=>client.query(typeof sql==='string'?sql.replaceAll('CREATE TABLE IF NOT EXISTS','CREATE TEMP TABLE IF NOT EXISTS'):sql,...args);pool.connect=async()=>({query:(...args)=>client.query(...args),release(){}});
  await permissions.ensureStore();
  const express=require('express'),app=express();app.use(express.json());app.use((req,res,next)=>{req.user={username:req.headers['x-fixture-user']||'fixture',role:req.headers['x-role']||'editor'};next();});app.use('/inventory',require('../src/routes/technologyAssetRoutes'));app.use(require('../src/middleware/errorHandler').errorHandler);
  server=await new Promise(resolve=>{const listener=app.listen(0,'127.0.0.1',()=>resolve(listener));});const base='http://127.0.0.1:'+server.address().port+'/inventory';
  for(const [path,method] of [['','POST'],['/scan','POST'],['/11111111-1111-4111-8111-111111111111','PUT'],['/11111111-1111-4111-8111-111111111111','DELETE']])assert.equal((await fetch(base+path,{method,headers:{'x-role':'viewer','Content-Type':'application/json'},body:JSON.stringify(application())})).status,403);
  const originalScan=scanner.scan;
  try{
   for(const [index,code] of ['ECONNREFUSED','CERT_HAS_EXPIRED','ETIMEDOUT'].entries()){
    scanner.scan=async()=>{throw scanner.connectionError({code,message:'private raw socket secret'});};
    const response=await fetch(base+'/scan',{method:'POST',headers:{'Content-Type':'application/json','x-fixture-user':'scan-'+index},body:JSON.stringify({url:'http://10.0.0.8'})});
    assert.equal(response.status,code==='ETIMEDOUT'?504:502);const body=await response.json();assert.notEqual(body.error,'Internal server error');assert.equal(JSON.stringify(body).includes('private raw socket secret'),false);
   }
  }finally{scanner.scan=originalScan;}
  const scanImplementation=scanner.scan;
  try{
   scanner.scan=async(url,{onProgress})=>{onProgress({percent:20,stage:'navigation'});onProgress({percent:85,stage:'signatures'});return {url,status:200,technologies:[]};};
   const streamed=await fetch(base+'/scan',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson','x-fixture-user':'progress-fixture'},body:JSON.stringify({url:'https://fixture.example'})});
   assert.match(streamed.headers.get('content-type'),/ndjson/);const events=(await streamed.text()).trim().split('\n').map(JSON.parse);assert.deepEqual(events.filter(e=>e.type==='progress').map(e=>e.percent),[2,20,85,100]);assert.equal(events.at(-1).type,'result');
   scanner.scan=async()=>{throw scanner.connectionError({code:'ETIMEDOUT'});};
   const failed=await fetch(base+'/scan',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/x-ndjson','x-fixture-user':'progress-failed'},body:JSON.stringify({url:'https://fixture.example'})});
   const errors=(await failed.text()).trim().split('\n').map(JSON.parse);assert.equal(errors.at(-1).type,'error');assert.equal(errors.at(-1).status,504);assert.ok(!errors.some(e=>e.percent===100));
  }finally{scanner.scan=scanImplementation;}
  const created=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(application())});assert.equal(created.status,201);let row=await created.json();assert.equal(row.data.technologies[0].version,'8.2');
  row=await service.save(row.id,{...application(),version:1,technologies:[tech('PHP','8.3'),tech('PostgreSQL','17')]});assert.equal(row.version,2);
  await assert.rejects(service.save(row.id,{...application(),version:1}),{status:409});await assert.rejects(service.remove(row.id,1),{status:409});assert.equal((await service.list()).length,1);await service.remove(row.id,2);assert.equal((await service.list()).length,0);
 }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}pool.query=query;pool.connect=connect;await client.query('DROP TABLE IF EXISTS pg_temp.technology_assets,pg_temp.role_permissions');client.release();await pool.end();}
});

test('same-origin asset profiling is bounded and preserves page detections on asset failure',async()=>{
 const {assetUrls}=require('../src/shared/technologyFingerprint');
 const html='<meta name="generator" content="WordPress 6.7"><script src="/a.js"></script><link rel="stylesheet" href="/b.css"><script src="https://other.example/c.js"></script><script src="/d.js"></script><script src="/e.js"></script>';
 assert.deepEqual(assetUrls(html,'http://erp.internal:8080'),['http://erp.internal:8080/a.js','http://erp.internal:8080/b.css','http://erp.internal:8080/d.js','http://erp.internal:8080/e.js']);
 let calls=0;
 const result=await scanner.scan('http://erp.internal:8080',{resolve:async()=>[{address:'10.0.0.8',family:4}],request:async()=>({status:200,headers:{},html}),assetRequest:async()=>{calls++;if(calls===2)throw Error('fixture unavailable');return {status:200,html:'/*! jQuery v3.7.1 */'};}});
 assert.equal(calls,4);assert.equal(result.assetsChecked,3);assert.equal(result.assetFailures,1);
 assert.equal(result.scope,'internal');assert.ok(result.technologies.some(t=>t.name==='WordPress'&&t.version==='6.7'));
 assert.ok(result.technologies.some(t=>t.name==='jQuery'&&t.version==='3.7.1'));
 assert.equal(JSON.stringify(result).includes('fixture unavailable'),false);
});


test('one scan aggregates the full detected stack across headers, page and later static assets',async()=>{
 const html='<meta name="generator" content="WordPress 6.7"><div ng-version="19.0.1"></div>'+Array.from({length:13},(_,i)=>'<script src="/bundle-'+i+'.js"></script>').join('')+'<script src="https://cdn.example/axios/1.7.9/axios.min.js"></script>';
 let calls=0;
 const result=await scanner.scan('http://erp.internal',{resolve:async()=>[{address:'10.0.0.8',family:4}],request:async()=>({status:200,headers:{server:'nginx/1.24.0','x-powered-by':'PHP/8.2.4','set-cookie':['laravel_session=private']},html}),assetRequest:async()=>({status:200,html:++calls===12?'/*! Vue.js v3.5.0 | Bootstrap v5.3.3 | jQuery v3.7.1 */':''})});
 assert.equal(calls,12);assert.equal(result.assetsChecked,12);
 for(const [name,version] of [['nginx','1.24.0'],['PHP','8.2.4'],['WordPress','6.7'],['Angular','19.0.1'],['Axios','1.7.9'],['Vue.js','3.5.0'],['Bootstrap','5.3.3'],['jQuery','3.7.1'],['Laravel','']])assert.ok(result.technologies.some(t=>t.name===name&&t.version===version),name+' '+version);
 assert.equal(result.technologies.length,10);assert.equal(JSON.stringify(result).includes('private'),false);
});


test('PHP plus JavaScript plus Bootstrap are returned together, without inventing JavaScript versions',()=>{
 const result=detectPage({'x-powered-by':'PHP/8.3.1'},'<script src="/app.js"></script><link rel="stylesheet" href="/bootstrap-5.3.3.min.css">');
 assert.deepEqual(result.map(t=>[t.name,t.version]),[['PHP','8.3.1'],['JavaScript',''],['Bootstrap','5.3.3']]);
 assert.deepEqual(detectPage({},'<script type="application/ld+json">{}</script>'),[]);
});


test('numeric dotted version filters include four-part lower versions and support application-level AND/OR',async()=>{
 const {compareNumericVersions,searchTechnologyAssets}=await import('../frontend/client/src/services/technologyAssetSearch.mjs');
 for(const version of ['6.1.1.1','7.0','7.1.0','6.999.999.999'])assert.equal(compareNumericVersions(version,'7.1.1'),-1,version);
 assert.equal(compareNumericVersions('7.10','7.2'),1);assert.equal(compareNumericVersions('7.1.1.0','7.1.1'),0);assert.equal(compareNumericVersions('','7.1.1'),null);assert.equal(compareNumericVersions('7.1.1-rc1','7.1.1'),null);
 const records=[{id:'a',data:{technologies:[tech('PHP','6.1.1.1'),tech('Bootstrap','4.0')]}},{id:'b',data:{technologies:[tech('PHP','7.1.0'),tech('Bootstrap','5.0')]}},{id:'c',data:{technologies:[tech('PHP',''),tech('Bootstrap','3.0')]}}];
 const rules=[{name:'php',operator:'<',version:'7.1.1'},{name:'Bootstrap',operator:'<',version:'5'}];
 assert.deepEqual(searchTechnologyAssets(records,rules,'AND').map(row=>row.record.id),['a']);assert.deepEqual(searchTechnologyAssets(records,rules,'OR').map(row=>row.record.id),['a','b','c']);assert.deepEqual(searchTechnologyAssets(records,[rules[0]]).map(row=>row.record.id),['a','b']);
});


test('scan provenance details persist through inventory validation without unsafe metadata',()=>{
 const data=application();data.technologies[0].detection={engine:'WebAppAnalyzer',confidence:100,inferred:false,description:'PHP runtime',categories:['Programming languages']};
 assert.deepEqual(service.validate(data).technologies[0].detection,data.technologies[0].detection);
 data.technologies[0].detection.confidence=101;assert.throws(()=>service.validate(data),{status:400});
});


test('inventory table pages are capped at20 and clamp stale page numbers',async()=>{
 const {technologyTablePage}=await import('../frontend/client/src/services/technologyTablePage.mjs');const rows=Array.from({length:45},(_,i)=>i);
 assert.equal(technologyTablePage(rows).rows.length,20);assert.deepEqual(technologyTablePage(rows,3).rows,[40,41,42,43,44]);assert.equal(technologyTablePage(rows,99).page,3);assert.equal(technologyTablePage([],3).page,1);
});
