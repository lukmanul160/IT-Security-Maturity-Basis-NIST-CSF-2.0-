const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {createWorkbookJobs}=require('../src/services/workbookJobService');
const delay=()=>new Promise(resolve=>setImmediate(resolve));
test('Excel workers bound concurrency and queue size and reject saturation before creating another worker',async()=>{
 const workers=[];const jobs=createWorkbookJobs({maxActive:1,maxPending:1,workerFactory:()=>{const worker=new EventEmitter();worker.terminate=async()=>{};workers.push(worker);return worker;}});
 const first=jobs.run('maturity','write',[{},2026]),second=jobs.run('maturity','write',[{},2027]);
 await assert.rejects(jobs.run('maturity','write',[{},2028]),{status:429});assert.equal(workers.length,1);assert.equal(jobs.stats().pending,1);
 workers[0].emit('message',{ok:true,result:Buffer.from('first')});assert.equal((await first).toString(),'first');assert.equal(workers.length,2);
 workers[1].emit('message',{ok:true,result:Buffer.from('second')});assert.equal((await second).toString(),'second');assert.equal(jobs.stats().active,0);
});
test('worker timeout retains capacity until termination completes and then resumes queued work',async()=>{
 let terminate,created=0;const workers=[];
 const jobs=createWorkbookJobs({maxActive:1,maxPending:1,timeoutMs:15,workerFactory:()=>{const worker=new EventEmitter();worker.terminate=()=>new Promise(resolve=>terminate=resolve);workers.push(worker);created++;return worker;}});
 const first=jobs.run('maturity','read',[Buffer.from('x'),'csf']);const failure=assert.rejects(first,{status:503});
 const second=jobs.run('maturity','read',[Buffer.from('y'),'csf']);
 while(!terminate)await new Promise(resolve=>setTimeout(resolve,3));assert.equal(created,1);assert.equal(jobs.stats().active,1);terminate();await failure;assert.equal(created,2);
 workers[1].emit('message',{ok:true,result:{controls:[]}});await delay();terminate();assert.deepEqual(await second,{controls:[]});assert.equal(jobs.stats().active,0);
});
test('worker crashes do not leak internal errors or leave the queue blocked',async()=>{
 const workers=[];const jobs=createWorkbookJobs({maxActive:1,maxPending:1,workerFactory:()=>{const worker=new EventEmitter();worker.terminate=async()=>{};workers.push(worker);return worker;}});
 const first=jobs.run('maturity','read',[Buffer.from('x'),'csf']),failure=assert.rejects(first,error=>error.status===503&&!error.message.includes('secret'));
 const second=jobs.run('ikas','read',[Buffer.from('x')]);workers[0].emit('error',Error('secret path'));await failure;
 workers[1].emit('message',{ok:false,error:{status:400,message:'File Excel tidak valid.'}});await assert.rejects(second,{status:400});assert.equal(jobs.stats().active,0);
 await assert.rejects(jobs.run('../../secret','write',[]),{status:400});
});
test('real worker preserves independent maturity values and reasoning; invalid input keeps its validation status',async()=>{
 const jobs=createWorkbookJobs();const data={controls:{csf:[{id:'GV-OC-01',subcategory:'GV.OC-01: Mission',function:'GOVERN (GV)',category:'Organizational Context (GV.OC)'}]},assessment:{policyScores:{'GV-OC-01':0},practiceScores:{'GV-OC-01':5},notes:{'policy-GV-OC-01':'Policy\nline 2','practice-GV-OC-01':'Practice'}}};
 const buffer=await jobs.run('maturity','write',[{csf:data},2027]);assert.ok(Buffer.isBuffer(buffer));
 const parsed=await jobs.run('maturity','read',[buffer,'csf']);assert.equal(parsed.policyScores['GV-OC-01'],0);assert.equal(parsed.practiceScores['GV-OC-01'],5);assert.equal(parsed.notes['policy-GV-OC-01'],'Policy\nline 2');assert.equal(parsed.notes['practice-GV-OC-01'],'Practice');
 await assert.rejects(jobs.run('maturity','read',[Buffer.from('bad'),'csf']),{status:400});assert.equal(jobs.stats().active,0);
});
