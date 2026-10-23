// Compatibility entry point. The current lifecycle uses PostgreSQL TEMP tables only.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.execPath,['--test',path.join(__dirname,'../test/tprmGovernanceIntegration.test.js')],{stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;
process.exitCode=result.status ?? 1;
