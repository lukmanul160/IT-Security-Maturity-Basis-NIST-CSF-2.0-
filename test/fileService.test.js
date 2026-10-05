const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { after } = require('node:test');
const { pool } = require('../src/config/database');
const { uploadRoot } = require('../src/config/paths');
const fileService = require('../src/services/fileService');
const storage = require('../src/services/storageService');

after(() => pool.end());

test('replaceFile keeps the evidence path and updates its content and metadata', async () => {
  const token = crypto.randomBytes(8).toString('hex');
  const relativePath = `Test Replace/${token}/evidence.pdf`;
  const target = path.join(uploadRoot, ...relativePath.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, 'old content');

  try {
    const replacement = Buffer.from('%PDF-1.4 replacement');
    const result = await fileService.replaceFile(relativePath, {
      buffer: replacement,
      originalname: 'new-version.pdf',
      mimetype: 'application/pdf',
      size: replacement.length,
    });

    assert.equal(result.path, `upload/${relativePath}`);
    assert.equal(result.name, 'evidence.pdf');
    assert.deepEqual(await storage.read(relativePath), replacement);
    const stored = await pool.query('SELECT name, mime_type FROM evidence_files WHERE path = $1', [relativePath]);
    assert.deepEqual(stored.rows[0], { name: 'evidence.pdf', mime_type: 'application/pdf' });

    await assert.rejects(
      fileService.replaceFile(relativePath, { buffer: Buffer.from('doc'), originalname: 'wrong.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 3 }),
      { status: 400 }
    );
  } finally {
    await storage.remove(relativePath);
    await pool.query('DELETE FROM evidence_files WHERE path = $1', [relativePath]);
    await fs.rm(target, { force: true });
    await fs.rmdir(path.dirname(target)).catch(() => {});
    await fs.rmdir(path.join(uploadRoot, 'Test Replace')).catch(() => {});
  }
});


test('standalone library upload keeps successful files when a later upload fails and enforces Add', async () => {
 const vm=require('node:vm'),fs=require('node:fs');
 const source=fs.readFileSync('frontend/client/src/workspace/features/uploaded-files/editor-and-events.js','utf8');
 const fragment=source.slice(source.indexOf('let uploadedFilesUploading = false;'),source.indexOf("$('uploadedFilesUploadButton').addEventListener"));
 const elements={uploadedFilesStatus:{textContent:''},uploadedFilesUploadButton:{disabled:false},uploadedFilesUploadKind:{value:'policy'},uploadedFileSearch:{value:'old'},uploadedFileKindFilter:{value:'all'}};
 let allowed=true,requests=0;
 const context=vm.createContext({FormData,canPerform:()=>allowed,$:id=>elements[id],evidenceLibrary:[],evidenceLibraryError:'',renderUploadedFiles(){},refreshEvidenceLibrary:async()=>{},fetch:async(url,options)=>{
  requests++;assert.equal(url,'/api/files');assert.equal(options.body.get('functionName'),'Uploaded files');
  return requests===1?{ok:true,json:async()=>({name:'a.pdf',path:'upload/Uploaded files/Policy/id/a.pdf'})}:{ok:false,status:500,json:async()=>({error:'Storage unavailable'})};
 }});
 vm.runInContext(fragment,context);
 const files=[new Blob(['a'],{type:'application/pdf'}),new Blob(['b'],{type:'application/pdf'})];files[0].name='a.pdf';files[1].name='b.pdf';
 await context.uploadLibraryFiles(files);
 assert.equal(context.evidenceLibrary.length,1);assert.match(elements.uploadedFilesStatus.textContent,/1\/2.*Storage unavailable/);assert.equal(elements.uploadedFilesUploadButton.disabled,false);
 allowed=false;await context.uploadLibraryFiles(files);assert.equal(requests,2);assert.match(elements.uploadedFilesStatus.textContent,/Izin Add/);
});
