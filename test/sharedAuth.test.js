const test=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcryptjs');
const { pool }=require('../src/config/database');
const { createAuthState,restoreLock }=require('../src/services/authStateService');
const { migrate }=require('../src/services/migrationService');
test.after(()=>pool.end());
test('two independent replicas share persistent sessions, revocation, limits and restore gates',async()=>{
  await migrate(pool);
  const username='replica_'+process.pid,passwordHash=await bcrypt.hash('FixturePassword123',4);
  await pool.query('INSERT INTO app_users(username,password_hash,role) VALUES($1,$2,$3)',[username,passwordHash,'viewer']);
  const replicaPool=new (require('pg').Pool)({...pool.options,max:4});
  const first=createAuthState(pool),second=createAuthState(replicaPool),user={username,role:'viewer',credentialHash:passwordHash};
  try {
    const token=await first.create(user);
    assert.equal((await second.get(token)).username,username);
    assert.equal((await createAuthState(pool).get(token)).username,username,'fresh service instance survives restart');
    const stored=(await pool.query('SELECT token_hash FROM auth_sessions WHERE username=$1',[username])).rows[0];
    assert.notEqual(stored.token_hash,token);
    await second.presence(token,'risk-management');assert.equal((await first.office()).get(username).module,'risk-management');
    const replacement=await second.create(user);assert.equal(await first.get(token),null);
    await first.remove(token);assert.ok(await second.get(replacement));
    await second.removeUser(username);assert.equal(await first.get(replacement),null);
    const expired=await first.create(user);await pool.query("UPDATE auth_sessions SET expires_at=clock_timestamp()-INTERVAL '1 second' WHERE username=$1",[username]);assert.equal(await second.get(expired),null);
    const stale=await first.create(user);await pool.query("UPDATE app_users SET password_hash='changed' WHERE username=$1",[username]);assert.equal(await second.get(stale),null);
    await assert.rejects(first.create(user),{status:401});
    await pool.query('UPDATE app_users SET password_hash=$2 WHERE username=$1',[username,passwordHash]);
    const results=await Promise.all(Array.from({length:20},(_,i)=>(i%2?first:second).consume('fixture',username,5,60000)));
    assert.equal(results.filter(r=>r.allowed).length,5);
    const accountKey=require('node:crypto').createHash('sha256').update('login-account\0'+username).digest('hex');
    await first.consume('login-account',username,5,900000);
    await pool.query("UPDATE auth_rate_limits SET attempts=4,expires_at=clock_timestamp()+INTERVAL '1 second' WHERE key_hash=$1",[accountKey]);
    assert.ok((await second.consume('login-account',username,5,900000)).retryAfter>=899,'the fifth attempt starts a full lockout window');
    assert.equal((await first.consume('login-account',username,5,900000)).allowed,false);
    await pool.query("UPDATE auth_rate_limits SET expires_at=clock_timestamp()-INTERVAL '1 second'");assert.equal((await second.consume('fixture',username,5,60000)).allowed,true);
    const active=await first.create(user),lock=await pool.connect();
    try {await lock.query('SELECT pg_advisory_lock($1)',[restoreLock]);assert.equal(await second.get(active),null);await assert.rejects(first.create(user),{status:503});await assert.rejects(second.consume('fixture',username,5,1000),{status:503});}
    finally {await lock.query('SELECT pg_advisory_unlock($1)',[restoreLock]);lock.release();}
  } finally {await replicaPool.end();await pool.query('DELETE FROM auth_sessions WHERE username=$1',[username]);await pool.query('DELETE FROM app_users WHERE username=$1',[username]);}
});
test('HTTP login, identity and logout work across two listeners; failed logins share one budget',async t=>{
  const password='HttpFixture123',username='http_'+process.pid;
  await pool.query('INSERT INTO app_users(username,password_hash,role) VALUES($1,$2,$3)',[username,await bcrypt.hash(password,4),'viewer']);
  t.mock.method(require('../src/services/auditService'),'record',async()=>{});
  const app=require('../src/app'),servers=[app.listen(0,'127.0.0.1'),app.listen(0,'127.0.0.1')];
  await Promise.all(servers.map(server=>server.listening?null:new Promise(resolve=>server.once('listening',resolve))));
  const urls=servers.map(server=>'http://127.0.0.1:'+server.address().port);
  try {
    const login=await fetch(urls[0]+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});
    assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await fetch(urls[1]+'/api/auth/me',{headers:{cookie}})).json()).username,username);
    assert.equal((await fetch(urls[1]+'/api/auth/logout',{method:'POST',headers:{cookie}})).status,204);
    assert.equal((await fetch(urls[0]+'/api/auth/me',{headers:{cookie}})).status,401);
    for(let i=0;i<6;i++) {
      const response=await fetch(urls[i%2]+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'missing_'+process.pid,password:'Invalid123'})});
      assert.equal(response.status,i<5?401:429);
      if(i===5)assert.ok(Number(response.headers.get('retry-after'))>0);
    }
  } finally {
    await Promise.all(servers.map(server=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));}));
    await pool.query('DELETE FROM auth_sessions WHERE username=$1',[username]);await pool.query('DELETE FROM app_users WHERE username=$1',[username]);
  }
});
