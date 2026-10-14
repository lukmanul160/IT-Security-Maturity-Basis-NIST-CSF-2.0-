const {parentPort,workerData}=require('node:worker_threads');
const modules={maturity:'./maturityWorkbookService',ikas:'./ikasWorkbookService'};
try {
  const {kind,operation,args}=workerData;
  if(!Object.hasOwn(modules,kind)||!['read','write'].includes(operation))throw Error('Unsupported workbook operation');
  if(operation==='read')args[0]=Buffer.from(args[0]);
  const result=require(modules[kind])[operation](...args);
  parentPort.postMessage({ok:true,result});
} catch(error) {
  parentPort.postMessage({ok:false,error:{message:error.status?error.message:'Excel processing failed.',status:error.status||500}});
}
