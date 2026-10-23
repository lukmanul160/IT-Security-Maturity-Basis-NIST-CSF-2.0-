const test=require('node:test'),assert=require('node:assert/strict');
test('completion status colors distinguish unfinished, in-progress and finished in both languages',async()=>{
 const {statusTone}=await import('../frontend/client/src/services/statusColors.mjs');
 for(const value of ['Belum dilaporkan','BELUM SELESAI','Belum diisi','Open','Draft','Rejected','Overdue','Not reported','0%'])assert.equal(statusTone(value),'danger',value);
 for(const value of ['Dalam proses','In_progress','Pending Approval','In Treatment','Monitoring','Approved with Conditions','75%'])assert.equal(statusTone(value),'warning',value);
 for(const value of ['Sudah dilaporkan','Selesai','Lengkap','Sudah diisi','Closed','Complete','Approved','100%'])assert.equal(statusTone(value),'success',value);
 for(const value of ['N/A','Not applicable','Inactive'])assert.equal(statusTone(value),'neutral',value);
 for(const value of ['Belum dilaporkan kepada regulator besok','High','Very Low','',null,'1000%','Tidak dikenal'])assert.equal(statusTone(value),null,value);
});
