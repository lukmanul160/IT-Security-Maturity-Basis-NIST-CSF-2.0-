// Real browser/API regression against an isolated PostgreSQL schema.
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
pool.options.connectionTimeoutMillis=30000;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Cdp {
  constructor(url){this.socket=new WebSocket(url);this.id=0;this.pending=new Map();this.errors=[];}
  async connect(){await new Promise((resolve,reject)=>{this.socket.addEventListener('open',resolve);this.socket.addEventListener('error',reject);});this.socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const handler=this.pending.get(message.id);this.pending.delete(message.id);if(handler)message.error?handler.reject(new Error(message.error.message)):handler.resolve(message.result);}if(message.method==='Runtime.exceptionThrown')this.errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});}
  send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method));},60000);this.pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});this.socket.send(JSON.stringify({id,method,params}));});}
  async evaluate(expression){const result=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
  async wait(expression){for(let i=0;i<400;i++){try{if(await this.evaluate(`Boolean(${expression})`))return;}catch(error){if(!/Inspected target navigated|Cannot find context|Execution context.*destroyed/i.test(error.message))throw error;}await delay(100);}throw new Error('Timed out: '+expression);}
}
async function run(){
  const schema=`notes_test_${process.pid}_${Date.now()}`;
  const savedQuery=pool.query,originalConnect=pool.connect.bind(pool);
  const originalQuery=async(sql,...args)=>{const connection=await originalConnect();try{return await connection.query(sql,...args);}finally{connection.release();}};
  const rewrite=sql=>typeof sql==='string'?sql.replace(/\b(knowledge_notes|knowledge_note_folders|knowledge_note_images)\b/g,`"${schema}".$1`):sql;
  const profile=path.join(os.tmpdir(),`nist-notes-browser-${process.pid}-${Date.now()}`);
  let server,chrome,client,vite;
  try {
    await originalQuery(`CREATE SCHEMA "${schema}"`);
    pool.query=(sql,...args)=>originalQuery(rewrite(sql),...args);
    pool.connect=async()=>{const connection=await originalConnect();return {query:(sql,...args)=>connection.query(rewrite(sql),...args),release:()=>connection.release()};};
    const service=require('../src/services/knowledgeNoteService');await service.ensureStore();
    await service.createFolder('Security/Policies');await service.createFolder('Archive');
    const home=await service.create({title:'Home',content:'[[Policy]]',folder:''});
    const policy=await service.create({title:'Policy',content:'**important** [[Home]]',folder:'Security/Policies'});
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJz8AAAAASUVORK5CYII=','base64');
    await service.importNotes([{title:'Image example',folder:'Examples',content:'# Pedoman\n\nText before\n\n![[flowchart.png]]\n\nText after [[Home]]'}],[],[{path:'Examples/flowchart.png',content:png}]);
    const stale={...policy};await service.update(policy.id,{...policy,content:'**important** [[Home]]'});
    await assert.rejects(()=>service.update(stale.id,stale),{status:409});
    await assert.rejects(()=>service.removeFolder('Security'),{status:409});
    const {createServer}=await import('vite'),vue=(await import('@vitejs/plugin-vue')).default;
    const root=path.join(__dirname,'../frontend/client');
    vite=await createServer({configFile:false,root,plugins:[vue()],server:{middlewareMode:true,hmr:{port:20000+Math.floor(Math.random()*10000)}},appType:'custom',logLevel:'error'});
    const express=require('express'),app=express();app.use(express.json());
    app.get('/api/auth/me',(req,res)=>res.json({username:'test-admin',role:'admin'}));
    app.use('/api/knowledge-notes',(req,res,next)=>{req.user={role:'admin'};console.log('Browser API:',req.method,req.url);res.on('finish',()=>console.log('Browser API response:',req.method,req.url,res.statusCode));next();},require('../src/routes/knowledgeNoteRoutes'));
    app.get('/app',async(req,res)=>res.type('html').send(await vite.transformIndexHtml('/notes-preview.html',await fs.readFile(path.join(root,'notes-preview.html'),'utf8'))));
    app.use(vite.middlewares);app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base=`http://127.0.0.1:${server.address().port}`;
    const debugPort=9700+Math.floor(Math.random()*100);
    chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--disable-extensions','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
    let target;for(let i=0;i<100;i++){try{target=await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`,{method:'PUT'})).json();break;}catch{await delay(100);}}assert.ok(target,'Chrome started');
    client=new Cdp(target.webSocketDebuggerUrl);await client.connect();await client.send('Runtime.enable');await client.send('Page.enable');
    await client.send('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
    await client.send('Page.navigate',{url:base+'/app'});await client.wait('document.documentElement.dataset.frontend === "vue"');
    await client.evaluate('document.querySelector("[data-view=knowledge-notes]").click()');
    await client.wait('document.querySelector("[data-folder=Security]")');
    const search=async(value,scope='all')=>{await client.evaluate(`(()=>{const input=document.querySelector('.explorer input[type=search]'),select=document.querySelector('.search-scope');select.value=${JSON.stringify(scope)};select.dispatchEvent(new Event('change',{bubbles:true}));input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
    await search('Policy.md');await client.wait('document.querySelectorAll("[data-search-note]").length===1');
    assert.ok(await client.evaluate('document.querySelector(".search-result small").textContent.includes("Security/Policies/Policy.md")'));
    await search('important','content');await client.wait('document.querySelector(".search-result mark")?.textContent.toLowerCase()==="important"');
    await search('folder:Security file:Policy.md');await client.wait('document.querySelectorAll("[data-search-note]").length===1');
    await search('Home','title');await client.wait(`document.querySelector('[data-search-note="${home.id}"]')`);
    await client.evaluate(`document.querySelector('[data-search-note="${home.id}"]').click()`);
    await client.wait('document.querySelector(".layout main>input")?.value==="Home"');
    await search('');await client.wait('document.querySelector(".search-results")===null');
    console.log('Browser: file/path, body snippets, field operators, title filter and result navigation');
    const panelBefore=await client.evaluate('document.querySelector(".explorer").getBoundingClientRect().width');
    const separator=await client.evaluate('document.querySelector(".files-resizer").getBoundingClientRect().toJSON()');
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:separator.x+4,y:separator.y+100,button:'left',clickCount:1});
    await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:separator.x+94,y:separator.y+100,buttons:1,button:'left'});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:separator.x+94,y:separator.y+100,button:'left',clickCount:1});
    await client.wait('document.querySelector(".explorer").getBoundingClientRect().width>'+panelBefore);
    const panelSaved=await client.evaluate('JSON.parse(localStorage.getItem("nist-note-panel-widths")).files');
    assert.ok(panelSaved>=panelBefore+80);
    await client.evaluate('document.querySelector(".files-resizer").dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true}))');
    await client.wait('JSON.parse(localStorage.getItem("nist-note-panel-widths")).files==='+ (panelSaved-20));
    console.log('Browser: panel widths support dragging, keyboard adjustment and persisted preferences');

    assert.equal(await client.evaluate(`document.querySelector('[data-folder="Security/Policies"]')===null`),true);
    await client.evaluate('document.querySelector("[data-folder=Security]").click()');await client.wait(`document.querySelector('[data-folder="Security/Policies"]')`);
    await client.evaluate(`document.querySelector('[data-folder="Security/Policies"]').click()`);await client.wait(`document.querySelector('[data-note="${policy.id}"]')`);
    console.log('Browser: nested folders expand/collapse');
    // Create a child folder from the explorer and verify real persistence.
    await client.evaluate(`(()=>{const el=document.getElementById('knNewFolderName');el.value='Drafts';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);
    await client.wait(`document.querySelector('[data-folder="Security/Policies/Drafts"]')`);
    assert.ok((await service.folders()).includes('Security/Policies/Drafts'));
    // Drag note to Archive using the browser's DataTransfer and Vue event handlers.
    await client.evaluate(`(()=>{const source=document.querySelector('[data-note="${policy.id}"]').closest('.tree-row'),target=document.querySelector('[data-folder="Archive"]').closest('.tree-row'),data=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})()`);
    await client.wait('document.querySelector("#knowledgeNotesView [role=status]").textContent.includes("Catatan dipindahkan")');
    assert.equal((await service.list()).find(n=>n.id===policy.id).folder,'Archive');
    // Drag an entire folder subtree to Archive.
    await client.evaluate(`(()=>{const source=document.querySelector('[data-folder="Security"]').closest('.tree-row'),target=document.querySelector('[data-folder="Archive"]').closest('.tree-row'),data=new DataTransfer();source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:data}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));})()`);
    await client.wait(`document.querySelector('[data-folder="Archive/Security"]')`);
    assert.ok((await service.folders()).includes('Archive/Security/Policies/Drafts'));
    // Rename folder through its context menu, preserving descendants.
    await client.evaluate(`(()=>{window.prompt=()=> 'Renamed';document.querySelector('[data-folder="Archive/Security"]').closest('.tree-row').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));})()`);
    await client.evaluate('Array.from(document.querySelectorAll(".tree-menu button")).find(b=>b.textContent==="Ganti nama").click()');
    await client.wait(`document.querySelector('[data-folder="Archive/Renamed"]')`);
    assert.ok((await service.folders()).includes('Archive/Renamed/Policies/Drafts'));
    console.log('Browser: folder create, note drag, subtree drag and rename persist');
    // Reload confirms expanded state and saved folder paths survive.
    await client.send('Page.reload');await client.wait('document.documentElement.dataset.frontend === "vue"');await client.wait(`document.querySelector('[data-folder="Archive/Renamed"]')`);
    await client.evaluate(`document.querySelector('[data-note="${policy.id}"]').click()`);
    await client.wait('document.querySelector(".tiptap strong")?.textContent==="important"');
    await client.evaluate(`(()=>{const el=document.querySelector('.tiptap');el.focus();const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);})()`);
    const key=async(key,code,modifiers=0)=>{await client.send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:key==='Enter'?13:9,modifiers});await client.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});};
    await client.send('Input.insertText',{text:' [[Hom'});
    await client.wait('document.querySelectorAll(".wiki-suggestions [role=option]").length===1');
    assert.ok(await client.evaluate('document.querySelector(".wiki-suggestions [role=option]").textContent.includes("Home.md")'));
    await key('Enter','Enter');await client.wait('document.querySelector(".wiki-suggestions")===null');
    assert.ok(await client.evaluate('document.querySelector(".tiptap").textContent.includes("[[Home]] [[Home]]")'));
    await client.send('Input.insertText',{text:' [[]]'});await client.wait('document.querySelectorAll(".wiki-suggestions [role=option]").length===3');
    await client.evaluate('Array.from(document.querySelectorAll(".wiki-suggestions [role=option]")).find(b=>b.textContent.includes("Archive/Policy.md")).click()');
    await client.wait('document.querySelector(".tiptap").textContent.includes("[[Archive/Policy]]")');
    assert.equal(await client.evaluate('document.querySelector(".tiptap").textContent.includes("[[]]")'),false);
    console.log('Browser: [[ query filters saved notes, Enter selects, [[]] click inserts folder-qualified link');
    await key('Enter','Enter');await client.evaluate(`document.querySelector('[data-format="orderedList"]').click()`);
    await client.send('Input.insertText',{text:'First item'});await key('Enter','Enter');await client.send('Input.insertText',{text:'Second item'});await key('Tab','Tab');
    await client.wait('document.querySelector(".tiptap ol ol li")?.textContent.includes("Second item")');
    await key('Tab','Tab',8);await client.wait('document.querySelector(".tiptap ol ol")===null');
    await client.evaluate('Array.from(document.querySelectorAll("#knowledgeNotesView>.toolbar button")).find(b=>b.textContent==="Simpan").click()');
    await client.wait('document.querySelector("#knowledgeNotesView [role=status]").textContent.includes("Catatan disimpan")');
    const savedEditor=(await service.list()).find(n=>n.id===policy.id).content;
    assert.match(savedEditor,/1\. First item/);assert.match(savedEditor,/2\. Second item/);assert.match(savedEditor,/\[\[Home\]\]/);assert.match(savedEditor,/\*\*important\*\*/);
    await client.send('Page.reload');await client.wait('document.documentElement.dataset.frontend === "vue"');await client.wait(`document.querySelector('[data-note="${policy.id}"]')`);await client.evaluate(`document.querySelector('[data-note="${policy.id}"]').click()`);
    await client.wait('document.querySelectorAll(".tiptap ol>li").length===2');
    await client.evaluate(`(()=>{const el=document.querySelector('.tiptap'),data=new DataTransfer();data.setData('text/html','<img src=x onerror="window.editorXss=1"><script>window.editorXss=1</script><a href="javascript:window.editorXss=1">unsafe</a>');el.focus();el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));})()`);
    assert.equal(await client.evaluate('Boolean(window.editorXss || document.querySelector(".tiptap img[onerror],.tiptap script,.tiptap a[href^=javascript]"))'),false);
    await client.evaluate('Array.from(document.querySelectorAll("#knowledgeNotesView>.toolbar button")).find(b=>b.textContent==="Simpan").click()');await delay(100);
    console.log('Browser: numbering, list nesting, Markdown persistence, wikilinks and safe paste');
    await client.evaluate('Array.from(document.querySelectorAll("#knowledgeNotesView main .view-tabs button")).find(b=>b.textContent==="Graf hubungan").click()');
    await client.wait('document.querySelector(".knowledge-graph canvas")?.width > 0');
    await client.evaluate('Array.from(document.querySelectorAll(".zoom-tools button")).find(b=>b.textContent==="Jeda").click()');await delay(100);
    assert.equal(await client.evaluate('document.querySelector(".graph-info").textContent.includes("3 catatan")'),true);
    const originalZoom=await client.evaluate('document.querySelector(".zoom-tools span").textContent');
    const rect=await client.evaluate('document.querySelector(".knowledge-graph canvas").getBoundingClientRect().toJSON()');
    await client.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:rect.x+rect.width/2,y:rect.y+rect.height/2,deltaX:0,deltaY:-200});await delay(100);
    assert.notEqual(await client.evaluate('document.querySelector(".zoom-tools span").textContent'),originalZoom);
    const beforePan=await client.evaluate('document.querySelector(".knowledge-graph canvas").toDataURL()');
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x+12,y:rect.y+12,button:'left',clickCount:1});
    await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+65,y:rect.y+45,buttons:1,button:'left'});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x+65,y:rect.y+45,button:'left',clickCount:1});await delay(100);
    assert.notEqual(await client.evaluate('document.querySelector(".knowledge-graph canvas").toDataURL()'),beforePan);
    const nodePoint=await client.evaluate(`(()=>{const c=document.querySelector('.knowledge-graph canvas'),ctx=c.getContext('2d'),data=ctx.getImageData(0,0,c.width,c.height).data,r=c.getBoundingClientRect();let x=0,y=0,count=0;for(let i=0;i<data.length;i+=4)if(data[i]===245&&data[i+1]===243&&data[i+2]===255){x+=(i/4)%c.width;y+=Math.floor((i/4)/c.width);count++;}return {x:r.x+x/count*(r.width/c.width),y:r.y+y/count*(r.height/c.height),count};})()`);
    assert.ok(nodePoint.count>0,'Selected canvas node rendered');
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:nodePoint.x,y:nodePoint.y,button:'left',clickCount:1});
    await client.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:nodePoint.x+70,y:nodePoint.y+35,buttons:1,button:'left'});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:nodePoint.x+70,y:nodePoint.y+35,button:'left',clickCount:1});await delay(100);
    assert.ok(await client.evaluate('Boolean(document.querySelector(".knowledge-graph canvas"))'),'Dragging a node must not open the editor');
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:nodePoint.x+70,y:nodePoint.y+35,button:'left',clickCount:1});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:nodePoint.x+70,y:nodePoint.y+35,button:'left',clickCount:1});await client.wait('document.querySelector("#knowledgeNotesView .tiptap")');
    console.log('Browser: canvas wheel zoom, background pan, node drag and click-to-open');
    await search('Image example','title');await client.wait('document.querySelectorAll("[data-search-note]").length===1');
    await client.evaluate('document.querySelector("[data-search-note]").click()');
    await client.wait('document.querySelector(".tiptap img")?.naturalWidth>0');
    assert.ok(await client.evaluate('document.querySelector(".tiptap").textContent.includes("Text before")&&document.querySelector(".tiptap").textContent.includes("Text after")'));
    await client.evaluate('Array.from(document.querySelectorAll("#knowledgeNotesView main .view-tabs button")).find(b=>b.textContent==="Pratinjau").click()');
    await client.wait('document.querySelector(".is-readonly .tiptap img")?.naturalWidth>0');
    await client.evaluate('Array.from(document.querySelectorAll("#knowledgeNotesView main .view-tabs button")).find(b=>b.textContent==="Editor").click()');
    await client.wait('document.querySelector(".tiptap [data-note-id]")');
    const wikiRect=await client.evaluate('(()=>{const link=document.querySelector(".tiptap [data-note-id]");link.scrollIntoView({block:"center"});return link.getBoundingClientRect().toJSON();})()');
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:wikiRect.x+wikiRect.width/2,y:wikiRect.y+wikiRect.height/2,button:'left',clickCount:1,modifiers:2});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:wikiRect.x+wikiRect.width/2,y:wikiRect.y+wikiRect.height/2,button:'left',clickCount:1,modifiers:2});
    await client.wait('document.querySelector(".layout main>input")?.value==="Home"');
    console.log('Browser: text plus embedded image renders in editor and preview; Ctrl+click opens linked note');
    for(const nested of [false,true]){
      const importStarted=performance.now();
      const title=nested?'Imported nested':'Imported mixed';
      const selector=nested?'input[webkitdirectory]':'input[accept^=".md"]';
      await client.evaluate(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(png.toString('base64'))}),c=>c.charCodeAt(0));const data=new DataTransfer();const note=new File(['# Imported\\n\\n![[demo.png]]'],'${title}.md',{type:'text/markdown'});const image=new File([bytes],'demo.png',{type:'image/png'});if(${nested}){Object.defineProperty(note,'webkitRelativePath',{value:'DemoFolder/Subfolder/'+note.name});Object.defineProperty(image,'webkitRelativePath',{value:'DemoFolder/Subfolder/demo.png'});}data.items.add(note);data.items.add(image);const input=document.querySelector(${JSON.stringify(selector)});input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await client.wait('document.querySelector("#knowledgeNotesView [role=status]").textContent.includes("gambar berhasil diimpor")');
      console.log(`Import timing (${nested?'nested folder':'Markdown + image'}): ${Math.round(performance.now()-importStarted)} ms`);
      const imported=(await service.list()).find(note=>note.title===title);assert.ok(imported);
      assert.equal(imported.folder,nested?'DemoFolder/Subfolder':'');
      await search(title,'title');await client.wait('document.querySelectorAll("[data-search-note]").length===1');
      await client.evaluate('document.querySelector("[data-search-note]").click()');
      await client.wait('document.querySelector(".tiptap img")?.naturalWidth>0');
      // Return to the root note so the next import has a root destination.
      await search('Home','title');await client.wait(`document.querySelector('[data-search-note="${home.id}"]')`);await client.evaluate(`document.querySelector('[data-search-note="${home.id}"]').click()`);
    }
    console.log('Browser: both file import and nested folder import retain Markdown plus image attachments');
    await search('');
    await client.wait(`document.querySelector('[data-image="DemoFolder/Subfolder/demo.png"]')`);
    await client.evaluate(`document.querySelector('[data-image="DemoFolder/Subfolder/demo.png"]').click()`);
    await client.wait('document.querySelector(".image-preview-dialog img")?.naturalWidth>0');
    assert.equal(await client.evaluate('document.querySelector(".image-preview-dialog code").textContent'),'![[DemoFolder/Subfolder/demo.png]]');
    await client.evaluate('document.querySelector(".image-preview-dialog button").click()');
    console.log('Browser: image file is visible in its subfolder and opens a loaded preview');
    await search('Imported nested','title');await client.wait('document.querySelectorAll("[data-search-note]").length===1');await client.evaluate('document.querySelector("[data-search-note]").click()');await client.wait('document.querySelector(".tiptap img")?.naturalWidth>0');
    await client.evaluate(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(png.toString('base64'))}),c=>c.charCodeAt(0));const data=new DataTransfer();data.items.add(new File([bytes],'inserted.png',{type:'image/png'}));const input=document.querySelector('.knowledge-text-editor input[type=file]');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await client.wait('document.querySelector(".knowledge-text-editor [role=status]")?.textContent.includes("Gambar dimasukkan")');
    await client.wait('document.querySelectorAll(".tiptap img").length===2');
    await client.evaluate('Array.from(document.querySelectorAll("#knowledgeNotesView>.toolbar button")).find(b=>b.textContent==="Simpan").click()');
    await client.wait('document.querySelector("#knowledgeNotesView [role=status]").textContent.includes("Catatan disimpan")');
    assert.ok((await service.list()).find(note=>note.title==='Imported nested').content.includes('inserted.png]]'));
    console.log('Browser: inserting a new image uploads, renders, and persists its reference with the note');
    assert.ok(await client.evaluate('document.querySelector(".tiptap img").getBoundingClientRect().width<=320'));
    const imageRect=await client.evaluate('document.querySelector(".tiptap img").getBoundingClientRect().toJSON()');
    await client.send('Input.dispatchMouseEvent',{type:'mousePressed',x:imageRect.x+imageRect.width/2,y:imageRect.y+imageRect.height/2,button:'left',clickCount:1});
    await client.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:imageRect.x+imageRect.width/2,y:imageRect.y+imageRect.height/2,button:'left',clickCount:1});
    await client.wait('document.querySelector(".image-sizing")');
    await client.evaluate('Array.from(document.querySelectorAll(".image-sizing button")).find(b=>b.textContent==="Kecil").click()');
    await client.wait('document.querySelector(".tiptap img[width]")?.getAttribute("width")==="160"');
    await client.evaluate('Array.from(document.querySelectorAll("#knowledgeNotesView>.toolbar button")).find(b=>b.textContent==="Simpan").click()');
    await client.wait('document.querySelector("#knowledgeNotesView [role=status]").textContent.includes("Catatan disimpan")');
    for(let attempt=0;attempt<100;attempt++){
      if((await service.list()).find(note=>note.title==='Imported nested').content.includes('|160]]'))break;
      await delay(100);
    }
    assert.ok((await service.list()).find(note=>note.title==='Imported nested').content.includes('|160]]'));
    await client.evaluate('Array.from(document.querySelectorAll("#knowledgeNotesView main .view-tabs button")).find(b=>b.textContent==="Pratinjau").click()');
    await client.wait('document.querySelector(".tiptap img[width]")?.getAttribute("width")==="160"');
    assert.equal(await client.evaluate('document.querySelector(".image-sizing")===null'),true);
    assert.ok(await client.evaluate('document.querySelector(".tiptap img[width]").getBoundingClientRect().width<=160'));
    console.log('Browser: image widths can be changed, saved, and restored in read-only preview');
    await client.evaluate('Array.from(document.querySelectorAll("#knowledgeNotesView main .view-tabs button")).find(b=>b.textContent==="Editor").click()');
    await client.wait('document.querySelector(".tiptap[contenteditable=true]")');
    await client.evaluate(`(()=>{const el=document.querySelector('.tiptap');el.focus();const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);})()`);
    await client.send('Input.insertText',{text:' ![[demo.png]]'});
    await client.wait('document.querySelectorAll(".tiptap img").length===3 && [...document.querySelectorAll(".tiptap img")].every(img=>img.naturalWidth>0)');
    await client.evaluate('Array.from(document.querySelectorAll("#knowledgeNotesView>.toolbar button")).find(b=>b.textContent==="Simpan").click()');
    await client.wait('Array.from(document.querySelectorAll("#knowledgeNotesView>.toolbar button")).find(b=>b.textContent==="Simpan").disabled && !Array.from(document.querySelectorAll("#knowledgeNotesView>.toolbar button")).find(b=>b.textContent==="Muat ulang daftar").disabled');
    await client.send('Page.reload');
    await client.wait('document.querySelectorAll(".tiptap img").length===3 && [...document.querySelectorAll(".tiptap img")].every(img=>img.naturalWidth>0)');
    await client.wait(`document.querySelector('[data-image="DemoFolder/Subfolder/demo.png"]')`);
    console.log('Browser: typed image reference renders immediately and survives save/reload with folder files');


    assert.deepEqual(client.errors,[]);
    await client.evaluate('Array.from(document.querySelectorAll("#knowledgeNotesView main .view-tabs button")).find(b=>b.textContent==="Graf hubungan").click()');await delay(150);
    await fs.mkdir(path.join(__dirname,'../output/knowledge-notes'),{recursive:true});
    const screenshot=await client.send('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(__dirname,'../output/knowledge-notes/preview.png'),Buffer.from(screenshot.data,'base64'));
    console.log('Knowledge Notes browser regression passed. Screenshot: output/knowledge-notes/preview.png');
  } catch(error){if(client){console.log('Browser diagnostics:',await client.evaluate('({status:document.querySelector("#knowledgeNotesView [role=status]")?.textContent,view:document.querySelector("#knowledgeNotesView")?.className,buttons:Array.from(document.querySelectorAll("#knowledgeNotesView>.toolbar button")).map(b=>({text:b.textContent,disabled:b.disabled})),requests:performance.getEntriesByType("resource").filter(r=>r.name.includes("/api/")).map(r=>r.name),errors:[]})').catch(()=>''));await fs.mkdir(path.join(__dirname,'../output/knowledge-notes'),{recursive:true});const capture=await client.send('Page.captureScreenshot',{format:'png'}).catch(()=>null);if(capture)await fs.writeFile(path.join(__dirname,'../output/knowledge-notes/failure.png'),Buffer.from(capture.data,'base64'));}throw error;}
  finally {
    client?.socket.close();chrome?.kill();
    pool.query=savedQuery;pool.connect=originalConnect;await originalQuery(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(error=>console.error('Test schema cleanup:',error.message));await pool.end();
    if(server)server.closeAllConnections();
    // Vite's dev websocket can outlive a headless Chrome process on Windows.
    // Database cleanup completes before bounded shutdown of the preview server.
    await Promise.race([Promise.all([vite?.close(),server?new Promise(resolve=>server.close(resolve)):Promise.resolve()]),delay(5000)]);
    const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-notes-browser-')){await delay(300);await fs.rm(resolved,{recursive:true,force:true}).catch(()=>{});}
  }
}
run().then(()=>process.exit(0),error=>{console.error(error);process.exitCode=1;setTimeout(()=>process.exit(1),200);});
