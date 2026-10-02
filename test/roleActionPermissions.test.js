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
