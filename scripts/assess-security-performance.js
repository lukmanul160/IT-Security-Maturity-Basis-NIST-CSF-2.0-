// Local synthetic workbook load. No business records are imported or modified.
const {performance,monitorEventLoopDelay}=require('node:perf_hooks');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
if(process.argv[2]==='--probe') {
 let running=true;const samples=[];process.on('message',message=>{if(message==='stop')running=false;});
 (async()=>{await fetch(process.argv[3]).then(r=>r.arrayBuffer());process.send({ready:true});while(running){const start=performance.now();const response=await fetch(process.argv[3]);await response.arrayBuffer();samples.push({ms:performance.now()-start,status:response.status});await delay(10);}process.send({samples});process.disconnect();})().catch(error=>{process.send({error:error.message});process.disconnect();});
} else {
 const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib'),{fork}=require('node:child_process');
 const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))]||0;
 async function measure(url,load){
  const child=fork(__filename,['--probe',url],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
  await new Promise((resolve,reject)=>{child.once('message',message=>message.ready?resolve():reject(Error(message.error)));child.once('error',reject);});
  const samplesPromise=new Promise((resolve,reject)=>{child.on('message',message=>message.samples?resolve(message.samples):message.error&&reject(Error(message.error)));child.on('error',reject);});
  const histogram=monitorEventLoopDelay({resolution:10});histogram.enable();let peakRss=process.memoryUsage().rss;const memory=setInterval(()=>peakRss=Math.max(peakRss,process.memoryUsage().rss),10);
  await delay(50);const start=performance.now();await load();const workloadMs=performance.now()-start;await delay(50);clearInterval(memory);histogram.disable();child.send('stop');const samples=await samplesPromise;
  return {workloadMs:Math.round(workloadMs),requests:samples.length,statuses:[...new Set(samples.map(s=>s.status))],httpP50Ms:+percentile(samples.map(s=>s.ms),.5).toFixed(1),httpP95Ms:+percentile(samples.map(s=>s.ms),.95).toFixed(1),httpMaxMs:+Math.max(...samples.map(s=>s.ms)).toFixed(1),eventLoopMaxMs:+(histogram.max/1e6).toFixed(1),peakRssMb:+(peakRss/1048576).toFixed(1)};
 }
 async function run(){
  const app=require('../src/app'),workbook=require('../src/services/maturityWorkbookService'),jobs=require('../src/services/workbookJobService');let server;
  try {
   server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${server.address().port}/login`;
   workbook.write({},2026); // Warm the same template and parser for the baseline.
   const before=await measure(url,async()=>{for(let i=0;i<3;i++){workbook.write({},2026);await delay(5);}});
   const after=await measure(url,async()=>{await Promise.all(Array.from({length:3},()=>jobs.run('maturity','write',[{},2026])));});
   const html=await fs.readFile('frontend/public/vue/index.html','utf8'),asset=html.match(/src="(\/vue\/assets\/[^" ]+\.js)"/)[1],bundle=await fs.readFile(path.join('frontend/public',asset));
   const report={date:'2026-10-14',node:process.version,platform:process.platform,scenario:'Three original-template workbook exports while a separate process probes GET /login every 10 ms; no production load target or SLO is asserted.',beforeSynchronous:before,afterWorker:after,workerLimits:jobs.stats(),frontendBundle:{path:asset,bytes:bundle.length,gzipBytes:zlib.gzipSync(bundle,{level:4}).length}};
   await fs.writeFile('output/security-performance-2026-10-14.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await require('../src/config/database').pool.end();}
 }
 run().catch(error=>{console.error(error);process.exitCode=1;});
}
