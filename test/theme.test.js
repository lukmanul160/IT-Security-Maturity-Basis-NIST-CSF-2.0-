const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(saved,blocked=false){
 const values=new Map([['nist-basis-theme',saved]]),listeners={},root={dataset:{},style:{}};
 const context={document:{documentElement:root,readyState:'loading',querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:key=>{if(blocked)throw Error('blocked');return values.get(key);},setItem:(key,value)=>{if(blocked)throw Error('blocked');values.set(key,value);}},addEventListener:(key,handler)=>{listeners[key]=handler;},dispatchEvent(){},CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}};
 context.window=context;vm.runInNewContext(fs.readFileSync('frontend/public/theme.js','utf8'),context);return {context,values,listeners,root};
}
test('saved theme applies synchronously before the UI is mounted and toggles persist',()=>{
 const {context,values,root}=setup('dark');assert.equal(root.dataset.theme,'dark');assert.equal(root.style.colorScheme,'dark');context.NistTheme.set('light');assert.equal(root.dataset.theme,'light');assert.equal(values.get('nist-basis-theme'),'light');
});
test('invalid values and unavailable storage safely use light mode without preventing toggles',()=>{
 for(const input of ['unexpected',null,undefined])assert.equal(setup(input).root.dataset.theme,'light');
 const {context,root}=setup('dark',true);assert.equal(root.dataset.theme,'light');context.NistTheme.set('dark');assert.equal(root.dataset.theme,'dark');
});
test('theme preferences synchronize across tabs without affecting unrelated settings',()=>{
 const {root,listeners}=setup('light');listeners.storage({key:'other-setting',newValue:'dark'});assert.equal(root.dataset.theme,'light');listeners.storage({key:'nist-basis-theme',newValue:'dark'});assert.equal(root.dataset.theme,'dark');listeners.storage({key:'nist-basis-theme',newValue:null});assert.equal(root.dataset.theme,'light');
});
