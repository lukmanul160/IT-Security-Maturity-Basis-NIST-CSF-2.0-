const test=require('node:test');
const assert=require('node:assert/strict');
const {pool}=require('../src/config/database');
const permissions=require('../src/services/permissionService');

test('configured actions override role defaults but require read access',async t=>{
  let row={allowed:true,actions:{read:true,create:false,update:false,delete:true}};
  t.mock.method(pool,'query',async()=>({rows:[row]}));
  assert.equal(await permissions.has('user','risk-management','delete'),true);
  assert.equal(await permissions.has('user','risk-management','update'),false);
  assert.equal(await permissions.has('user','risk-management','create'),false);
  row.actions.read=false;
  assert.equal(await permissions.has('user','risk-management','delete'),false);
  assert.equal(await permissions.has('admin','risk-management','delete'),true);
  row={allowed:true,actions:{read:true,create:true,update:true,delete:true}};
  assert.equal(await permissions.has('user','account','delete'),false);
  assert.equal(await permissions.hasFileAction('user','delete'),true);
  row.actions.delete=false;
  assert.equal(await permissions.hasFileAction('user','delete'),false);
});

test('permission payload validates all entries before starting a transaction',async t=>{
  t.mock.method(pool,'connect',async()=>{throw Error('Invalid input reached DB');});
  for(const payload of [
    {permissions:['unknown']},
    {permissions:['csf'],actions:{csf:{read:false,create:true,update:false,delete:false}}},
    {permissions:['csf'],actions:{csf:{read:true,create:'yes',update:false,delete:false}}},
    {permissions:['account'],actions:{account:{read:true,create:false,update:true,delete:false}}}
  ])await assert.rejects(permissions.update('user',payload),{status:400});
});

test('action settings persist and are enforced by real routes', {skip:process.env.RUN_PERMISSION_DB_TESTS!=='1'},async t=>{
  const client=await pool.connect(); let server;
  try {
    await client.query('CREATE TEMP TABLE role_permissions(role TEXT,permission_key TEXT,allowed BOOLEAN,actions JSONB,updated_at TIMESTAMPTZ DEFAULT NOW(),PRIMARY KEY(role,permission_key))');
    for(const [key] of permissions.permissions) await client.query('INSERT INTO role_permissions(role,permission_key,allowed) VALUES($1,$2,true)',['user',key]);
    t.mock.method(pool,'query',client.query.bind(client));
    t.mock.method(pool,'connect',async()=>({query:client.query.bind(client),release(){}}));
    const actions={'risk-management':{read:true,create:false,update:true,delete:true}};
    await permissions.update('user',{permissions:['risk-management'],actions});
    assert.deepEqual((await permissions.getRoleActions('user'))['risk-management'],actions['risk-management']);
    const express=require('express'), app=express();
    const {requirePermission}=require('../src/middleware/permission');
    app.use((req,res,next)=>{req.user={role:'user'};next();});
    for(const [method,action] of [['get','read'],['post','create'],['put','update'],['delete','delete']])app[method]('/risk',requirePermission('risk-management',action),(req,res)=>res.sendStatus(204));
    server=app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
    const url=`http://127.0.0.1:${server.address().port}/risk`;
    for(const [method,status] of [['GET',204],['POST',403],['PUT',204],['DELETE',204]])assert.equal((await fetch(url,{method})).status,status);
    await permissions.update('user',{permissions:['risk-management'],actions:{'risk-management':{read:true,create:false,update:false,delete:false}}});
    assert.equal((await fetch(url,{method:'DELETE'})).status,403,'existing session uses updated permissions immediately');
    assert.equal((await fetch(url,{method:'PUT'})).status,403);
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    await client.query('DROP TABLE pg_temp.role_permissions'); client.release(); await pool.end();
  }
});

test('every feature applies Read, Add, Edit and Delete independently',async t=>{
  let row;
  t.mock.method(pool,'query',async()=>({rows:row ? [row] : []}));
  for(const [key] of permissions.permissions) {
    if(key==='account')continue;
    for(const denied of permissions.actions) {
      row={allowed:true,actions:Object.fromEntries(permissions.actions.map(action=>[action,action!==denied]))};
      for(const action of permissions.actions) assert.equal(await permissions.has('viewer',key,action),denied!=='read' && action!==denied,`${key}: ${denied} disabled, ${action}`);
    }
  }
  row={allowed:false};
  for(const action of permissions.actions) assert.equal(await permissions.hasFileAction('user',action),false,'file ownership never bypasses denied page access');
  row={allowed:true,actions:{read:true,create:true,update:true,delete:false}};
  assert.equal(await permissions.canDeleteOwnedEvidence('user'),false,'owned audit evidence still requires Delete');
});

test('real feature APIs reject each disabled action before handling data',async t=>{
  const express=require('express'),app=express();
  let denied='read';
  t.mock.method(pool,'query',async()=>({rows:[{allowed:true,actions:Object.fromEntries(permissions.actions.map(action=>[action,action!==denied]))}]}));
  t.mock.method(require('../src/services/knowledgeNoteService'),'ensureStore',async()=>{});
  app.use(express.json());
  app.use((req,res,next)=>{req.user={role:'viewer',username:'test'};next();});
  app.use('/api',require('../src/routes'));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const features=[
    ['csf','csf/one'],['privacy','privacy/one'],['frameworks','frameworks/iso27001/controls/one'],
    ['risk-acceptance','risk-acceptance/one'],['risk-management','risk-management/one'],
    ['policy-register','policy-register/1'],['tprm','tprm/1'],['tprm-questionnaires','tprm-questionnaires/1'],
    ['questionnaire-templates','questionnaire-templates/1'],['personnel-certifications','personnel-certifications/1'],
    ['personnel-certifications/organization-personnel','personnel-certifications/organization-personnel/1'],
    ['certification-roadmap-catalog','certification-roadmap-catalog/1'],['knowledge-notes','knowledge-notes/1'],
    ['threat-modelling','threat-modelling/1'],['audit-finding-tracker','audit-finding-tracker/11111111-1111-1111-1111-111111111111'],['files','files/test.pdf']
  ];
  for(const [action,method] of [['read','GET'],['create','POST'],['update','PUT'],['delete','DELETE']]) {
    denied=action;
    for(const [collection,record] of features) {
      const url=method==='GET'||method==='POST' ? collection : record;
      const response=await fetch(`${base}/${url}`,{method,headers:{'Content-Type':'application/json'},...(method==='GET' ? {} : {body:'{}'})});
      assert.equal(response.status,403,`${method} ${url}`);
    }
  }
  denied='delete';
  for(const url of ['assessment/reset','privacy/assessment/reset','frameworks/iso27001/assessment/reset'])assert.equal((await fetch(`${base}/${url}`,{method:'POST'})).status,403,`reset ${url}`);
});

test('policy option rename uses Edit and rejected saves never become local changes',async()=>{
  const vm=require('node:vm'),fs=require('node:fs');
  for(const permitted of [true,false]) {
    const calls=[],local=[];const status={textContent:''};
    const context=vm.createContext({policyDropdownState:{},policyDropdownDefaults:{},canManagePolicyRegister:action=>permitted&&action==='update',localStorage:{setItem:(...args)=>local.push(args)},$:()=>status,fetch:async(url,options={})=>{calls.push({url,method:options.method||'GET'});return {ok:true,json:async()=>[{id:1,fieldName:'categories',optionValue:'Old',sortOrder:0}]};}});
    vm.runInContext(require('node:fs').readFileSync('frontend/client/src/workspace/features/policy-register/dropdowns.js','utf8'),context);
    context.updatePolicySelectOptions=()=>{};context.updatePolicyDatalist=()=>{};
    vm.runInContext("policyDropdownManagerKey='categories';policyDropdownEditingOptions=['Renamed'];policyDropdownEditingOriginals=['Old'];",context);
    await context.savePolicyDropdownOptions();
    assert.deepEqual(calls.map(call=>call.method),permitted?['GET','PUT']:['GET']);
    assert.equal(local.length,permitted?1:0);
  }
});
