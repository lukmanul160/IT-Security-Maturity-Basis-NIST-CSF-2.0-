const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateRuntimeManifest, readRuntimeManifest, readSourceGroup } = require('../scripts/lib/runtime-manifest.cjs');
const prefix = 'frontend/client/src/workspace/';
const row = (name, file) => ({name,path:prefix+'features/shared/'+file});
const assembler = import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(prefix+'runtime-source.js','utf8')).toString('base64'));

test('manifest preserves explicit order and source-group ownership', () => {
  const plan = [row('second','second.js'),{...row('first','first.js'),group:'workflow'}];
  assert.deepEqual(validateRuntimeManifest(plan),plan);
});

test('manifest rejects traversal, non-source paths and duplicate execution', () => {
  for (const file of ['.env','../.env',prefix+'features/../../.env',prefix+'source.html','/tmp/secret.js']) {
    assert.throws(()=>validateRuntimeManifest([{name:'bad',path:file}]),/source path/);
  }
  assert.throws(()=>validateRuntimeManifest([row('same','first.js'),row('same','second.js')]),/Duplicate/);
  assert.throws(()=>validateRuntimeManifest([row('first','first.js'),row('second','first.js')]),/Duplicate/);
  assert.throws(()=>validateRuntimeManifest([]),/must contain/);
});

test('source groups compile independently and register workflow listeners once', () => {
  for (const group of ['risk-workflow','assessment-gaps','tprm-lifecycle']) new vm.Script(readSourceGroup(group));
  const risk = readSourceGroup('risk-workflow');
  assert.equal(risk.split("$('riskWorkflowForm').addEventListener('submit'").length-1,1);
  assert.throws(()=>readSourceGroup('missing-group'),/Unknown runtime/);
});

test('assembler keeps boundaries and reports missing or duplicate source entries', async () => {
  const {assembleWorkspaceSource} = await assembler;
  const plan=[row('local','view.js'),{name:'scoring',path:'src/shared/ikasScoring.js'}];
  assert.equal(assembleWorkspaceSource({'./features/shared/view.js':'view'}, {'src/shared/ikasScoring.js':'score'},plan),'viewscore');
  assert.throws(()=>assembleWorkspaceSource({}, {}, plan),/Missing workspace/);
  assert.throws(()=>assembleWorkspaceSource({'./features/shared/view.js':'view'}, {},[plan[0],plan[0]]),/Duplicate workspace/);
});

test('Vite-shaped source map assembles the exact manifest program', async () => {
  const {assembleWorkspaceSource} = await assembler;
  const plan=readRuntimeManifest(),parts={},shared={};
  for(const entry of plan){
    const source=fs.readFileSync(entry.path,'utf8');
    if(entry.path.startsWith(prefix))parts['./'+path.posix.relative(prefix,entry.path)]=source;
    else shared[entry.path]=source;
  }
  const result=assembleWorkspaceSource(parts,shared,plan);
  assert.equal(result,plan.map(entry=>fs.readFileSync(entry.path,'utf8')).join(''));
  new vm.Script(result);
});
