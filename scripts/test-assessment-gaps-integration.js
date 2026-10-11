// Real API round trip using uniquely named controls; remove only this run's fixtures.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {pool}=require('../src/config/database');
const auth=require('../src/config/auth');
const gaps=require('../src/services/assessmentGapService');
(async()=>{
  let server,token,file;
  const code='GAP-TEST-'+crypto.randomUUID();
  try{
    await gaps.ensureStore();
    const user=(await pool.query("SELECT username FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user);
    token=auth.createSession({...user,role:'admin'});
    for(const framework of Object.keys(gaps.permissionKeys))await pool.query('INSERT INTO controls(framework_id,code,function,category,subcategory,implementation,"references") VALUES($1,$2,$3,$4,$5,$6,$7)',[framework,code,'Gap Test','Gap Test',code+': fixture','','']);
    server=require('../src/app').listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const base='http://127.0.0.1:'+server.address().port;
    const request=async(url,method='GET',body)=>{
      const response=await fetch(base+'/api/'+url,{method,headers:{cookie:auth.sessionCookie+'='+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
      return {status:response.status,body:await response.json()};
    };
    const form=new FormData();form.append('functionName','ISO 27001');form.append('kind','practice');form.append('files',new Blob(['%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'],{type:'application/pdf'}),'gap-fixture-'+crypto.randomUUID()+'.pdf');
    const uploaded=await request('files/batch','POST',form);assert.equal(uploaded.status,201);file=uploaded.body[0];assert.ok(file.path);
    for(const framework of Object.keys(gaps.permissionKeys)){
      const url='assessment-gaps/'+framework+'/'+code;
      const first=await request(url,'POST',{description:'Kurang poin a',status:'Open',evidence:[]});assert.equal(first.status,201);
      const second=await request(url,'POST',{description:'Kurang poin b',status:'Open',evidence:[{path:file.path,name:'untrusted-name'}]});assert.equal(second.status,201);assert.notEqual(first.body.id,second.body.id);assert.equal(second.body.evidence[0].name,file.name);
      const updated=await request(url+'/'+first.body.id,'PUT',{description:'Poin a selesai',status:'Closed',evidence:[],updatedAt:first.body.updatedAt});assert.equal(updated.status,200);
      assert.equal((await request(url+'/'+first.body.id,'PUT',{description:'Stale edit',status:'Open',evidence:[],updatedAt:first.body.updatedAt})).status,409);
      const list=await request('assessment-gaps/'+framework);const own=list.body.filter(row=>row.controlCode===code);assert.equal(own.length,2);assert.equal(own.filter(row=>row.status==='Closed').length,1);
      const failed=await request('assessment-gaps/'+framework+'/import','POST',{gaps:[{id:crypto.randomUUID(),framework,controlCode:code,description:'Batch rollback',status:'Open',evidence:[]},{id:crypto.randomUUID(),framework,controlCode:'missing-control',description:'Invalid',status:'Open',evidence:[]}]});assert.equal(failed.status,400);
      assert.equal((await request('assessment-gaps/'+framework)).body.filter(row=>row.controlCode===code).length,2);
      // Exported stable IDs survive restore and importing the same file twice does not duplicate gaps.
      await pool.query('DELETE FROM assessment_gaps WHERE framework_id=$1 AND control_code=$2',[framework,code]);
      for(let repeat=0;repeat<2;repeat++)assert.equal((await request('assessment-gaps/'+framework+'/import','POST',{gaps:own})).body.imported,2);
      const restored=(await request('assessment-gaps/'+framework)).body.filter(row=>row.controlCode===code);assert.equal(restored.length,2);assert.equal(restored.find(row=>row.id===updated.body.id).status,'Closed');assert.equal(restored.find(row=>row.id===second.body.id).evidence[0].path,file.path);
      const monitoring=await request('monitoring-dashboard');const module=monitoring.body.modules.find(row=>row.id===framework);assert.equal(module.state,'ready');assert.ok(module.metrics.find(metric=>metric.label==='Gap Open').value>=1);assert.ok(module.metrics.find(metric=>metric.label==='Gap Closed').value>=1);
      assert.equal((await request(url+'/'+second.body.id,'DELETE',{updatedAt:restored.find(row=>row.id===second.body.id).updatedAt})).status,200);
      assert.equal((await request('assessment-gaps/'+framework+'/missing-control','POST',{description:'a',status:'Open',evidence:[]})).status,404);
    }
    console.log('PASS: four frameworks persist multiple gaps, close/reload, canonical evidence, stale edits, deletion, invalid controls and monitoring KPIs.');
  }finally{
    await pool.query('DELETE FROM controls WHERE code=$1 AND framework_id=ANY($2::text[])',[code,Object.keys(gaps.permissionKeys)]);
    if(file)await require('../src/services/fileService').deleteFile(file.path,{library:true});
    if(token)auth.destroySession(token);
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    await pool.end();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
