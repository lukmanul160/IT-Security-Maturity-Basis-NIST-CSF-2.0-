const test=require('node:test');const assert=require('node:assert/strict');
const service=require('../src/services/reminderRecipientService');const {pool}=require('../src/config/database');
test('recipient register validates names and email addresses',()=>{
 assert.deepEqual(service.validate({owner:' SOC Manager ',email:' SOC@EXAMPLE.COM '}),{owner:'SOC Manager',email:'soc@example.com'});
 assert.deepEqual(service.validate({owner:'CISO',email:''}),{owner:'CISO',email:''});
 for(const data of [{owner:'',email:'a@example.com'},{owner:'SOC',email:'invalid'},{owner:'x'.repeat(161),email:'a@example.com'}])assert.throws(()=>service.validate(data),{status:400});
});
test('register persists recipients and updates same name without duplicates',async t=>{
 const client=await pool.connect();try{
 await client.query('CREATE TEMP TABLE reminder_recipient_register(owner_key TEXT PRIMARY KEY,owner TEXT NOT NULL,email TEXT NOT NULL,updated_at TIMESTAMPTZ DEFAULT NOW())');
 t.mock.method(pool,'query',client.query.bind(client));
 await service.save({owner:'SOC Manager',email:'soc@example.com'});
 await service.save({owner:'soc manager',email:'replacement@example.com'});
 assert.deepEqual(await service.list(),[{owner:'soc manager',email:'replacement@example.com'}]);
 await service.create({owner:'IT Security',email:'it@example.com'});
 await assert.rejects(service.create({owner:'IT SECURITY',email:'duplicate@example.com'}),{status:409});
 assert.deepEqual(await service.update('IT Security',{owner:'Security Team',email:'team@example.com'}),{owner:'Security Team',email:'team@example.com'});
 await assert.rejects(service.update('Security Team',{owner:'SOC Manager',email:'conflict@example.com'}),{status:409});
 await assert.rejects(service.update('missing',{owner:'Missing',email:'missing@example.com'}),{status:404});
 await service.remove('SECURITY TEAM');
 await assert.rejects(service.remove('Security Team'),{status:404});
 assert.deepEqual(await service.list(),[{owner:'soc manager',email:'replacement@example.com'}]);
 t.mock.method(require('../src/services/auditService'),'record',async()=>{});
 await service.registerOwners(['CISO','IT Governance','SOC Manager']);await service.registerOwners(['CISO']);assert.equal((await service.list()).filter(row=>row.owner==='CISO').length,1);assert.equal((await service.list()).find(row=>row.owner==='CISO').email,'');assert.equal((await service.list()).find(row=>row.owner==='soc manager').email,'replacement@example.com');
 const auth=require('../src/config/auth');
 const server=require('../src/app').listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const admin=auth.createSession({username:'recipient-test-admin',role:'admin'}),viewer=auth.createSession({username:'recipient-test-viewer',role:'viewer'});
 try{const base='http://127.0.0.1:'+server.address().port+'/api/reminder-recipients';
 for(const method of ['POST','PUT','DELETE']){const url=base+(method==='POST'?'':'/SOC%20Manager');assert.equal((await fetch(url,{method,headers:{Cookie:auth.sessionCookie+'='+viewer,'Content-Type':'application/json'},body:method==='DELETE'?undefined:JSON.stringify({owner:'Protected',email:'safe@example.com'})})).status,403);}
 const headers={Cookie:auth.sessionCookie+'='+admin,'Content-Type':'application/json'};
 assert.equal((await fetch(base,{method:'POST',headers,body:JSON.stringify({owner:'Route Test',email:'route@example.com'})})).status,200);
 assert.equal((await fetch(base+'/Route%20Test',{method:'PUT',headers,body:JSON.stringify({owner:'Renamed Route',email:'updated@example.com'})})).status,200);
 assert.equal((await fetch(base+'/Renamed%20Route',{method:'DELETE',headers})).status,204);
 }finally{auth.destroySession(admin);auth.destroySession(viewer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }finally{client.release(true);await pool.end();}
});
