const assert = require('node:assert/strict');
const { pool } = require('../src/config/database');
const { PDFDocument } = require('pdf-lib');
(async () => {
  const auth = require('../src/config/auth');
  const username = (await pool.query("SELECT username FROM app_users WHERE role='admin' LIMIT 1")).rows[0].username;
  const token = auth.createSession({username,role:'admin'});
  const server = require('../src/app').listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base = 'http://127.0.0.1:'+server.address().port+'/api/personnel-certifications';
  let person, certification, filePath;
  const request = (url,options={})=>fetch(base+url,{...options,headers:{Cookie:`${auth.sessionCookie}=${token}`,...options.headers}});
  try {
    let response = await request('/organization-personnel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({personnelName:'Certificate test '+Date.now()})});
    assert.equal(response.status,201); person=await response.json();
    const pdf=await PDFDocument.create();pdf.addPage();const original=Buffer.from(await pdf.save());
    const form=new FormData();form.append('data',JSON.stringify({personnelId:person.id,certificationName:'Integration certificate'}));form.append('certificate',new Blob([original],{type:'application/pdf'}),'certificate.pdf');
    response=await request('',{method:'POST',body:form});assert.equal(response.status,201);certification=await response.json();filePath=certification.certificateFile.path.replace(/^upload\//,'');
    response=await request('/'+certification.id+'/certificate');assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.deepEqual(Buffer.from(await response.arrayBuffer()),original);
    response=await request('/'+certification.id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({personnelId:person.id,certificationName:'Updated certificate'})});assert.equal(response.status,200);assert.equal((await response.json()).certificateFile.path,certification.certificateFile.path);
    response=await request('/'+certification.id+'/certificate?download=1');assert.ok(response.headers.get('content-disposition').startsWith('attachment;'));await response.arrayBuffer();
    const remove=new FormData();remove.append('data',JSON.stringify({personnelId:person.id,certificationName:'Updated certificate'}));remove.append('removeCertificate','true');
    response=await request('/'+certification.id,{method:'PUT',body:remove});assert.equal(response.status,200);assert.equal((await response.json()).certificateFile,null);
    response=await request('/'+certification.id+'/certificate');assert.equal(response.status,404);
    console.log('PASS: multipart registration, exact original PDF preview/download, preservation on edit and explicit removal.');
  } finally {
    if(certification) await request('/'+certification.id,{method:'DELETE'});
    if(person) await request('/organization-personnel/'+person.id,{method:'DELETE'});
    if(filePath) {await require('../src/services/storageService').remove(filePath);await pool.query('DELETE FROM evidence_files WHERE path=$1',[filePath]);}
    auth.destroySession(token);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await pool.end();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
