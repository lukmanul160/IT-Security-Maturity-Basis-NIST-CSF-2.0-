const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => import('../frontend/client/src/services/canvasInteraction.mjs');
test('canvas keyboard supports Windows and Mac undo, redo, save and movement', async () => {
  const {canvasShortcut} = await load();
  for (const command of ['ctrlKey','metaKey']) {
    for (const [key,shiftKey,action] of [['z',false,'undo'],['z',true,'redo'],['y',false,'redo'],['s',false,'save'],['d',false,'duplicate'],['c',false,'copy'],['v',false,'paste']]) {
      assert.equal(canvasShortcut({key,[command]:true,shiftKey}),action);
    }
  }
  assert.equal(canvasShortcut({key:'ArrowLeft'}),'left');
  assert.equal(canvasShortcut({key:'Delete'}),'delete');
});
test('typing, composition, dialogs handled by callers, and consumed events keep native editing', async () => {
  const {canvasShortcut} = await load();
  assert.equal(canvasShortcut({key:'z',ctrlKey:true,target:{closest:()=>({})}}),null);
  assert.equal(canvasShortcut({key:'z',ctrlKey:true,isComposing:true}),null);
  assert.equal(canvasShortcut({key:'z',ctrlKey:true,defaultPrevented:true}),null);
  assert.equal(canvasShortcut({key:'ArrowLeft',altKey:true}),null);
});
