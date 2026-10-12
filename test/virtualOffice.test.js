const { test } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../src/config/auth');
const { pool } = require('../src/config/database');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
test('shared places are exclusive, reusable after departure and isolated from walking collisions', async () => {
  const { createPlaceReservations, createCrowdGrid, chooseActivity, activities } = await import(pathToFileURL(path.resolve(__dirname,'../frontend/public/virtual-office/assets/office-activities.js')));
  const reservations=createPlaceReservations(),slots=[{key:'sofa-left',x:7.4,z:4},{key:'sofa-right',x:8.6,z:4}];
  assert.equal(reservations.reserve(1,'lounge',slots).key,'sofa-left');
  assert.equal(reservations.reserve(2,'lounge',slots).key,'sofa-right');
  assert.equal(reservations.reserve(3,'lounge',slots),null);
  assert.equal(reservations.reserve(1,'lounge',slots).key,'sofa-left');
  reservations.release(1);assert.equal(reservations.reserve(3,'lounge',slots).key,'sofa-left');
  reservations.release(99);reservations.clear();assert.equal(reservations.reserve(4,'lounge',slots).key,'sofa-left');
  const grid=createCrowdGrid();grid.update(1,{x:0,z:0});grid.update(2,{x:1,z:0});
  assert.equal(grid.canMove(2,{x:.3,z:0}),false);assert.equal(grid.canMove(2,{x:1.5,z:0}),true);
  grid.update(1,{x:0,z:0},false);assert.equal(grid.canMove(2,{x:.3,z:0}),true);
  const sequence=Array.from({length:activities.length},(_,phase)=>chooseActivity(49,phase).name);
  assert.equal(new Set(sequence).size,activities.length);
  assert.notDeepEqual(sequence,Array.from({length:activities.length},(_,phase)=>chooseActivity(50,phase).name));
});
test('public office displays registered names and valid sessions without publishing account secrets', async t => {
  const rows = [{ id: 1, username: 'private.admin', full_name: '  Maya Putri  ', role: 'admin' }, { id: 2, username: 'editor01', full_name: ' ', role: 'editor' }];
  t.mock.method(pool, 'query', async sql => ({ rows: sql.includes('audit_events') ? [{username:'private.admin',event_type:'data.read',path:'/api/auth/users',status_code:200,created_at:'2026-10-11T01:00:00Z'}] : rows }));
  const token = auth.createSession({ username: rows[0].username, role: 'admin' });
  t.after(() => auth.destroySession(token));
  auth.getSession(token).officeModule = 'monitoring-dashboard';
  const service = require('../src/services/virtualOfficeService');
  const result = await service.snapshot();
  assert.equal(result.capacity, 30);
  assert.deepEqual(result.users[0], { id: 1, role: 'admin', name: 'Maya Putri', online: true, activity: 'Viewing user accounts.', activityAt: '2026-10-11T01:00:00.000Z' });
  assert.equal(result.users[1].name, 'editor01');
  assert.equal(result.users[1].online, false);
  assert.ok(!JSON.stringify(result).includes('private.'));
  assert.ok(!JSON.stringify(result).includes(token));
  auth.destroySession(token);
  assert.equal((await service.snapshot()).users[0].online, false);
  rows.push(...Array.from({ length: 30 }, (_, i) => ({ id: i+3, username: `user${i}`, role: 'user' })));
  assert.equal((await service.snapshot()).capacity, 32);
  rows.pop();
  assert.equal((await service.snapshot()).users.length, 31);
});
test('office is public while session presence writes and account data require login', async t => {
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 1, username: 'hidden', role: 'admin' }] }));
  t.mock.method(require('../src/services/auditService'), 'record', async () => {});
  const server=require('../src/app').listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const route of ['/virtual-office','/virtual-office/assets/office.js','/virtual-office/assets/three.module.js','/api/public/virtual-office'])assert.equal((await fetch(base+route,{redirect:'manual'})).status,200,route);
  assert.equal((await fetch(base+'/api/office-presence',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"module":"monitoring-dashboard"}'})).status,401);
  assert.equal((await fetch(base+'/api/auth/users')).status,401);
  const token=auth.createSession({username:'hidden',role:'admin'});t.after(()=>auth.destroySession(token));
  const headers={Cookie:`${auth.sessionCookie}=${token}`,'Content-Type':'application/json'};
  assert.equal((await fetch(base+'/api/office-presence',{method:'POST',headers,body:'{"module":"monitoring-dashboard"}'})).status,204);
  assert.equal(auth.getSession(token).officeModule,'monitoring-dashboard');
  assert.equal((await fetch(base+'/api/office-presence',{method:'POST',headers,body:'{"module":"arbitrary confidential text"}'})).status,400);
  auth.getSession(token).createdAt=0;
  assert.equal((await fetch(base+'/api/public/virtual-office').then(r=>r.json())).users[0].online,false);
});

test('audit activity uses English descriptions without exposing raw paths or data', () => {
  const { describeActivity } = require('../src/services/virtualOfficeService');
  assert.equal(describeActivity({ event_type:'data.read', path:'/api/monitoring-dashboard', status_code:200 }), 'Viewing the monitoring dashboard.');
  assert.equal(describeActivity({ event_type:'data.update', path:'/api/auth/users/private-secret', status_code:200 }), 'Updating user accounts.');
  assert.equal(describeActivity(null), 'Signed in. No activity has been recorded yet.');
  assert.equal(describeActivity({ event_type:'request.error', path:'/api/files/private-secret', status_code:403 }), 'An attempt to access files was unsuccessful.');
});

test('toilet access routes avoid walls in both directions', async () => {
  const { toiletAccess, canTraverseOffice } = await import(pathToFileURL(path.resolve(__dirname,'../frontend/public/virtual-office/assets/office-activities.js')));
  for(const x of [8,12]) {
    const route=toiletAccess(x);
    for(let i=1;i<route.length;i++)assert.ok(canTraverseOffice(route[i-1],route[i]));
    route.reverse();for(let i=1;i<route.length;i++)assert.ok(canTraverseOffice(route[i-1],route[i]));
  }
  assert.equal(canTraverseOffice({x:8,z:8},{x:8,z:11}),false);
  assert.equal(canTraverseOffice({x:8,z:11},{x:12,z:11}),false);
});
