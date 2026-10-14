const {Worker}=require('node:worker_threads');
const path=require('node:path');
const fail=(message,status)=>Object.assign(Error(message),{status});
function createWorkbookJobs({maxActive=2,maxPending=4,timeoutMs=30000,workerFactory=data=>new Worker(path.join(__dirname,'workbookWorker.js'),{workerData:data,resourceLimits:{maxOldGenerationSizeMb:256}})}={}) {
  let active=0;const pending=[];
  function pump() {
    while(active<maxActive&&pending.length) {
      const job=pending.shift();active++;
      let worker,timer,finished=false;
      const finish=async(error,result)=>{
        if(finished)return;finished=true;clearTimeout(timer);
        // Reserve capacity until termination completes, including timeout/error cases.
        try{await worker?.terminate();}catch{}
        active--;pump();if(error)job.reject(error);else job.resolve(job.operation==='write'?Buffer.from(result):result);
      };
      try {
        worker=workerFactory({kind:job.kind,operation:job.operation,args:job.args});
        timer=setTimeout(()=>finish(fail('Pemrosesan Excel melewati batas waktu. Kurangi ukuran file atau jumlah kontrol.',503)),timeoutMs);
        worker.once('message',message=>message.ok?finish(null,message.result):finish(fail(message.error.message,message.error.status)));
        worker.once('error',()=>finish(fail('Pemrosesan Excel gagal. Coba lagi dengan file yang lebih kecil.',503)));
        worker.once('exit',()=>{if(!finished)finish(fail('Pemrosesan Excel terhenti. Coba lagi.',503));});
      }catch{finish(fail('Pemrosesan Excel tidak dapat dimulai.',503));}
    }
  }
  function run(kind,operation,args) {
    if(!['maturity','ikas'].includes(kind)||!['read','write'].includes(operation)||!Array.isArray(args))return Promise.reject(fail('Operasi Excel tidak valid.',400));
    if(active>=maxActive&&pending.length>=maxPending)return Promise.reject(fail('Pemrosesan Excel sedang penuh. Coba lagi sebentar.',429));
    return new Promise((resolve,reject)=>{pending.push({kind,operation,args,resolve,reject});pump();});
  }
  return {run,stats:()=>({active,pending:pending.length,maxActive,maxPending})};
}
const jobs=createWorkbookJobs();
module.exports={createWorkbookJobs,run:jobs.run,stats:jobs.stats};
