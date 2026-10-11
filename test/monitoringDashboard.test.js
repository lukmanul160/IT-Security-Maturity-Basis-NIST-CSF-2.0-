const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../src/services/monitoringDashboardService');
const permissions = require('../src/services/permissionService');
const { pool } = require('../src/config/database');

test('assessment monitoring includes explicit gaps without treating maturity shortfalls as findings',async t=>{
  t.mock.method(permissions,'getRoleActions',async()=>({csf:{read:true},assessment:{read:true}}));
  t.mock.method(pool,'query',async()=>({rows:[{code:'DE.AE-02',category:'Detect'}]}));
  t.mock.method(require('../src/services/assessmentService'),'getAssessment',async()=>({policyScores:{'DE.AE-02':4},practiceScores:{'DE.AE-02':4}}));
  t.mock.method(require('../src/services/assessmentGapService'),'list',async()=>[{controlCode:'DE.AE-02',status:'Open',evidence:[]},{controlCode:'DE.AE-02',status:'Closed',evidence:[{path:'upload/a.pdf'}]}]);
  const row=(await service.snapshot({role:'viewer'})).modules.find(row=>row.id==='csf');
  assert.equal(row.progress,100);assert.equal(row.issues.pending,1);assert.equal(row.issues.incomplete,1);
  assert.equal(row.metrics.find(metric=>metric.label==='Gap Open').value,1);assert.equal(row.metrics.find(metric=>metric.label==='Gap Closed').value,1);
});

test('monitoring queries no business module without its read permission', async t => {
  t.mock.method(permissions, 'getRoleActions', async () => ({}));
  t.mock.method(pool, 'query', async () => { throw Error('Unauthorized query'); });
  assert.deepEqual((await service.snapshot({ role: 'viewer' })).modules, []);
});
test('file monitoring uses the existing owner-scoped evidence reader', async t => {
  const user = { role: 'user', username: 'employee' };
  t.mock.method(permissions, 'getRoleActions', async () => ({ files: { read: true } }));
  t.mock.method(require('../src/services/evidenceAccessService'), 'list', async actual => {
    assert.equal(actual, user); return [{ source: 'Asset Register' }, { source: 'Knowledge Notes' }];
  });
  const result = await service.snapshot(user);
  assert.equal(result.modules.length, 1);
  assert.equal(result.modules[0].id, 'files');
  assert.equal(result.modules[0].total, 2);
  assert.equal(result.modules[0].ownOnly, true);
  assert.equal(JSON.stringify(result).includes('employee'), false);
});
test('dashboard deadlines use Bangkok day boundaries and include today through 30 days', () => {
  const today = service.todayInBangkok(new Date('2026-10-08T18:00:00Z'));
  assert.equal(today, '2026-10-09');
  assert.deepEqual(service.deadlines([{ due: '2026-10-08' }, { due: '2026-10-09' }, { due: '2026-11-08' }, { due: '2026-11-09' }, { due: '' }], 'due', today), { overdue: 1, upcoming: 2 });
  assert.deepEqual(service.deadlines([{ due: '2026-10-08', status: 'retired' }], 'due', today, r => r.status !== 'retired'), { overdue: 0, upcoming: 0 });
});
test('new-record trends group actual timestamps into Bangkok months and preserve empty months', () => {
  const result = service.recordTrend([{ created_at: '2026-09-30T18:00:00Z' }, { created_at: '2026-09-01T12:00:00Z' }, { created_at: '2020-01-01' }], new Date('2026-10-09T00:00:00Z'));
  assert.equal(result.length, 6);
  assert.deepEqual(result.slice(-2), [{ label: '2026-09', value: 1 }, { label: '2026-10', value: 1 }]);
  assert.equal(result[0].value, 0);
});

test('monitoring validates calendar dates and derives CIA from actual assessment indicators',()=>{
  assert.equal(service.validDay('2026-02-30'),'');
  assert.deepEqual(service.deadlines([{due:'2026-02-30'}],'due','2026-03-01'),{overdue:0,upcoming:0});
  assert.equal(service.ciaLevel({confidentiality:5,integrity:4,availability:3,likelihood:4}),'High');
  assert.equal(service.ciaLevel({confidentiality:1,integrity:1,availability:1,likelihood:1}),'Low');
  assert.equal(service.ciaLevel({level:'high'}),'Belum dinilai');
});

test('acceptance monitoring requires all sign-off stages and distinguishes rejected decisions',()=>{
  const row={business_owner_decision:'one_year',cis_decision:'approved'};
  assert.equal(service.acceptanceStatus(row),'Pending');
  for(const stage of ['requestor','cio','cis'])Object.assign(row,{[stage+'_name']:'Reviewer',[stage+'_signed']:true,[stage+'_date']:'2026-10-10'});
  assert.equal(service.acceptanceStatus(row),'Approved');
  assert.equal(service.acceptanceStatus({...row,cis_decision:'conditional'}),'Approved with conditions');
  assert.equal(service.acceptanceStatus({...row,cio_date:'2026-02-30'}),'Pending');
  assert.equal(service.acceptanceStatus({...row,business_owner_decision:'denied'}),'Rejected');
});

test('closed risks do not contribute high or overdue monitoring indicators',async t=>{
  t.mock.method(permissions,'getRoleActions',async()=>({'risk-management':{read:true}}));
  t.mock.method(pool,'query',async()=>({rows:[{risk_rating:'High',treatment_action:'Closed',deadline:'2026-01-01'},{risk_rating:'High',treatment_action:'Mitigate',deadline:'2026-10-11',risk_owner:'Owner',residual_likelihood:2,residual_impact:2}]}));
  const row=(await service.snapshot({role:'viewer'},new Date('2026-10-10T00:00:00Z'))).modules[0];
  assert.equal(row.overdue,0);assert.equal(row.upcoming,1);assert.equal(row.issues.critical,1);assert.equal(row.issues.incomplete,0);
});
test('failure of one readable module does not invent zero values or suppress other modules', async t => {
  t.mock.method(permissions, 'getRoleActions', async () => ({ 'risk-management': { read: true }, 'asset-register': { read: true } }));
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('risk_register')) throw Object.assign(Error('private SQL detail'), { code: '42P01' });
    return { rows: [{ status: 'in-use', renewal_date: '2026-10-09', risk: 'high', created_at: '2026-10-09T00:00:00Z' }] };
  });
  t.mock.method(console, 'error', () => {});
  const result = await service.snapshot({ role: 'viewer' }, new Date('2026-10-09T00:00:00Z'));
  assert.equal(result.modules.find(m => m.id === 'risk-management').state, 'unavailable');
  assert.equal(result.modules.find(m => m.id === 'risk-management').total, null);
  assert.equal(result.modules.find(m => m.id === 'asset-register').upcoming, 1);
  assert.equal(JSON.stringify(result).includes('private SQL'), false);
});
test('monitoring endpoint enforces dashboard read permission and prevents caching', async t => {
  t.mock.method(permissions, 'has', async role => role === 'editor');
  t.mock.method(service, 'snapshot', async () => ({ modules: [] }));
  const app = require('express')();
  app.use((req, res, next) => { req.user = { role: req.get('X-Role') || 'viewer' }; next(); });
  app.use(require('../src/routes/monitoringDashboardRoutes'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port;
    assert.equal((await fetch(url)).status, 403);
    const response = await fetch(url, { headers: { 'X-Role': 'editor' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
