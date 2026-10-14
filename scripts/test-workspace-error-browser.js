const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),{Cdp}=require('./test-threat-modelling-browser');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(){
 const app=require('express')(),temp=await fs.mkdtemp(path.join(os.tmpdir(),'nist-error-security-'));let server,chrome,cdp;
 try{
  app.get('/renderer.js',async(req,res)=>res.type('js').send(await fs.readFile('frontend/client/src/services/workspaceError.js','utf8')));app.get('/',(req,res)=>res.send('<!doctype html><div id="app"></div>'));
  server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`,port=9930+Math.floor(Math.random()*40);
  chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${temp}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let target;for(let i=0;i<100;i++){try{target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();break;}catch{await delay(100);}}assert.ok(target);cdp=new Cdp(target.webSocketDebuggerUrl);await cdp.connect();await cdp.send('Runtime.enable');await cdp.send('Page.enable');await cdp.send('Page.navigate',{url:base});await cdp.wait('document.getElementById("app")');
  const payload='<img src=x onerror="window.errorPayloadExecuted=true"><script>window.errorPayloadExecuted=true</script>';
  await cdp.evaluate(`(async()=>{const {renderWorkspaceError}=await import('/renderer.js');window.reloadClicks=0;renderWorkspaceError(document.getElementById('app'),{message:${JSON.stringify(payload)}},()=>window.reloadClicks++);})()`);await delay(100);
  assert.equal(await cdp.evaluate('document.querySelector("#app p").textContent'),payload);assert.equal(await cdp.evaluate('document.querySelectorAll("#app img,#app script").length'),0);assert.equal(await cdp.evaluate('Boolean(window.errorPayloadExecuted)'),false);assert.equal(await cdp.evaluate('document.getElementById("app").inert'),false);
  await cdp.evaluate('document.querySelector("#app button").click()');assert.equal(await cdp.evaluate('window.reloadClicks'),1);assert.deepEqual(cdp.errors,[]);console.log('PASS: HTML/script payload is displayed as text and reload button remains usable.');
 }finally{cdp?.socket.close();chrome?.kill();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}const resolved=path.resolve(temp);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-error-security-')){await delay(1000);await fs.rm(resolved,{recursive:true,force:true}).catch(()=>{});}}
}
run().catch(error=>{console.error(error.stack);process.exitCode=1;});
