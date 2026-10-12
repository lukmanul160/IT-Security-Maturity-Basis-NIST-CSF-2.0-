// All assessment mutations use browser fixtures; existing business data is preserved.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const seed=require('../data/ikas-data.json');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  let server,chrome,ws,token;const profile=path.join(os.tmpdir(),'nist-ikas-'+Date.now()),auth=require('../src/config/auth');
  try{
    const user=(await pool.query("SELECT username FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user);
    token=auth.createSession({username:user.username,role:'admin'});server=require('../src/app').listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port,probe=require('node:net').createServer();probe.listen(0,'127.0.0.1');await new Promise(resolve=>probe.once('listening',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
    chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    for(let i=0;i<80;i++){try{const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);break;}catch{await delay(100);}}
    assert.ok(ws);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));let id=0;const pending=new Map(),errors=[];
    ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){pending.get(message.id)(message);pending.delete(message.id);}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});
    const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,message=>message.error?reject(Error(message.error.message)):resolve(message.result));ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{let result;try{result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});}catch(error){if(/Inspected target navigated|Execution context was destroyed|Cannot find context/.test(error.message))return undefined;throw error;}if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
    const wait=async expression=>{for(let i=0;i<250;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Wait failed: '+expression+' / '+JSON.stringify(errors));};
    await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`{
      const original=window.fetch.bind(window),seed=${JSON.stringify(seed)},keys=${JSON.stringify(require('../src/services/permissionService').permissions.map(([key])=>key))};
      const jobs=[];let active=0;
      const native=(input,options)=>new Promise((resolve,reject)=>{jobs.push({input,options,resolve,reject});pump();});
      function pump(){while(active<3&&jobs.length){const job=jobs.shift();active++;original(job.input,job.options).then(job.resolve,job.reject).finally(()=>{active--;pump();});}}
      const fresh={periods:[{year:2026,mode:'new',legacy:false}],data:{2026:{controls:seed.controls,assessment:{scores:{},policyScores:{},practiceScores:{},notes:{},attachments:{},targetScores:{},respondent:{}},targets:[],gaps:[]}}};
      const fixture=JSON.parse(sessionStorage.getItem('qa-ikas')||JSON.stringify(fresh));window.qaIkas=fixture;window.qaIkasWrites=[];
      const save=()=>sessionStorage.setItem('qa-ikas',JSON.stringify(fixture)),response=(body,status=200)=>status===204?new Response(null,{status}):new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
      window.fetch=async(input,options={})=>{
        const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.origin),method=options.method||'GET',parts=url.pathname.split('/').filter(Boolean);
        if(url.pathname==='/api/auth/me')return response({username:'IKAS Fixture',role:'admin',permissions:keys,actions:Object.fromEntries(keys.map(key=>[key,{read:true,create:true,update:true,delete:true}]))});
        if(url.pathname==='/api/ikas-template')return response({version:seed.version,domains:seed.domains,respondentFields:seed.respondentFields});
        if(parts[1]==='assessment-periods'&&parts[2]==='ikas'){
          if(method==='GET')return response(fixture.periods);
          const body=options.body?JSON.parse(options.body):{};
          if(method==='POST'){const value=structuredClone(fixture.data[body.sourceYear]);if(body.mode==='new'){value.assessment={scores:{},policyScores:{},practiceScores:{},notes:{},attachments:{},targetScores:{},respondent:{}};value.gaps=[];}fixture.data[body.year]=value;fixture.periods.unshift({year:body.year,mode:body.mode,sourceYear:body.sourceYear,legacy:false});save();return response(body,201);}
          if(method==='DELETE'){delete fixture.data[Number(parts[3])];fixture.periods=fixture.periods.filter(row=>row.year!==Number(parts[3]));save();return response(null,204);}
        }
        if(parts[1]==='ikas'||parts[1]==='assessment-gaps'&&parts[2]==='ikas'||parts[1]==='frameworks'&&parts[2]==='ikas'){
          const year=Number(url.searchParams.get('assessmentYear')||2026),data=fixture.data[year],body=options.body?JSON.parse(options.body):{};if(!data)return response({error:'Missing year'},404);if(method!=='GET')window.qaIkasWrites.push({path:url.pathname,year,method});
          if(parts[1]==='ikas'&&parts[2]==='assessment'){if(method==='PUT')data.assessment=body;if(parts[3]==='reset')data.assessment={scores:{},policyScores:{},practiceScores:{},notes:{},attachments:{},targetScores:{},respondent:{}};save();return response(data.assessment,parts[3]==='reset'?204:200);}
          if(parts[1]==='ikas'){if(method==='PUT'){const index=data.controls.findIndex(row=>row.id===parts[2]);data.controls[index]={...data.controls[index],...body};save();return response(data.controls[index]);}if(method==='POST'){data.controls.push(body);save();return response(body,201);}if(method==='DELETE'){data.controls=data.controls.filter(row=>row.id!==parts[2]);save();return response(null,204);}return response(data.controls);}
          if(parts[1]==='assessment-gaps'){if(method==='POST'){const row={...body,id:crypto.randomUUID(),framework:'ikas',controlCode:parts[3],updatedAt:new Date().toISOString()};data.gaps.push(row);save();return response(row,201);}return response(data.gaps);}
          if(parts[3]==='targets'){if(method==='PUT'){data.targets=data.targets.filter(row=>row.category!==decodeURIComponent(parts[4]));data.targets.push({category:decodeURIComponent(parts[4]),targetScore:body.targetScore});save();return response(body);}return response(data.targets);}
        }
        if(method!=='GET'&&parts[0]==='api')return response({});
        return native(input,options);
      };
    }`});
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await call('Page.navigate',{url:base+'/app'});
    await wait("document.querySelector('#ikasCoreList [data-ikas-index]') && document.querySelector('#ikasView [data-assessment-period] select')?.value==='2026'");
    await evaluate("document.querySelector('.nav-item[data-view=ikas]').click();document.querySelector('[data-ikas-tab=core]').click()");
    assert.equal(await evaluate('ikasRows.length'),181);
    await evaluate("(()=>{const select=document.querySelector('#ikasCoreList [data-ikas-index]');select.value='0';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await wait("window.qaIkas.data[2026].assessment.scores['IKAS-1.1.1-a']===0");
    await evaluate("(()=>{const input=document.querySelector('#ikasCoreList [data-ikas-note=\"IKAS-1.1.1-a\"]');input.value='Reasoning IKAS\\nBaris kedua';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await wait("window.qaIkas.data[2026].assessment.notes['IKAS-1.1.1-a']==='Reasoning IKAS\\nBaris kedua'");
    await evaluate("document.querySelector('.nav-item[data-view=ikas-manage]').click()");await wait("document.querySelector('#ikasManageBody [data-ikas-edit]')");
    await evaluate("document.querySelector('#ikasManageBody [data-ikas-edit]').click();document.querySelector('#ikasControlForm [name=scope]').value='Ruang lingkup uji';document.querySelector('#ikasControlForm').requestSubmit()");
    await wait("!document.querySelector('#ikasControlModal[open]') && !document.querySelector('form[aria-busy=true]') && window.qaIkas.data[2026].controls[0].ikas.scope==='Ruang lingkup uji'");
    await evaluate("document.querySelector('.nav-item[data-view=ikas]').click();document.querySelector('#ikasView [data-assessment-period] button').click()");await wait("!!document.querySelector('.assessment-year-dialog[open]:not(#ikasControlModal)')");
    await evaluate("(()=>{const form=document.querySelector('.assessment-year-dialog[open] form');form.elements.year.value='2027';form.elements.mode.value='duplicate';form.requestSubmit();})()");
    await wait("document.querySelector('#ikasView [data-assessment-period] select')?.value==='2027' && document.querySelector('#ikasCoreList [data-ikas-index]')");
    assert.equal(await evaluate("ikasState.scores['IKAS-1.1.1-a']"),0);assert.equal(await evaluate("ikasRows[0].ikas.scope"),'Ruang lingkup uji');
    const exported=await evaluate("moduleTransfer.collect('ikas')");assert.equal(exported.assessmentYear,2027);assert.equal(exported.data.controls.length,181);assert.equal(exported.data.assessment.policyScores,undefined);assert.equal(exported.data.assessment.practiceScores,undefined);
    await evaluate("document.querySelector('#ikasView [data-assessment-period] button').click()");await wait("!!document.querySelector('.assessment-year-dialog[open]')");
    await evaluate("(()=>{const form=document.querySelector('.assessment-year-dialog[open] form');form.elements.year.value='2028';form.elements.mode.value='new';form.requestSubmit();})()");
    await wait("document.querySelector('#ikasView [data-assessment-period] select')?.value==='2028' && document.querySelector('#ikasCoreList [data-ikas-index]')");assert.deepEqual(await evaluate('ikasState.scores'),{});
    await evaluate("document.querySelector('#ikasView [data-delete-assessment-year]').click()");await wait("!!document.querySelector('.assessment-year-dialog[open]')");await evaluate("(()=>{const form=document.querySelector('.assessment-year-dialog[open] form');form.elements.confirmation.value='2028';form.requestSubmit();})()");
    await wait("document.querySelector('#ikasView [data-assessment-period] select')?.value==='2027' && document.querySelector('#ikasCoreList [data-ikas-index]')");
    assert.equal(await evaluate("window.qaIkas.data[2026].assessment.scores['IKAS-1.1.1-a']"),0);
    for(const width of [1440,768,390]){await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await evaluate("document.querySelector('[data-ikas-tab=core]').click()");await delay(150);assert.equal(await evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1'),false,'page fits '+width);}
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await evaluate("document.querySelector('[data-ikas-tab=overview]').click()");
    await evaluate("document.querySelector('[data-ikas-tab=respondent]').click()");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#ikasRespondentFields input')).borderTopWidth"),'1px');
    assert.equal(await evaluate("document.querySelector('#ikasRespondentFields select[name=D6]')!==null"),true);
    assert.equal(await evaluate("document.querySelector('.nav-item[data-view=ikas] .nav-icon svg')!==null"),true);
    const respondentShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(__dirname,'../output/ikas-respondent-preview.png'),Buffer.from(respondentShot.data,'base64'));
    await evaluate("document.querySelector('[data-ikas-tab=core]').click()");
    assert.equal(await evaluate("document.querySelectorAll('#ikasCoreList [data-ikas-index]').length"),20);
    assert.equal(await evaluate("/Policy|Practice/.test(document.querySelector('#ikasView').innerText)"),false);
    const screenshot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(__dirname,'../output/ikas-assessment-preview.png'),Buffer.from(screenshot.data,'base64'));
    await evaluate("document.querySelector('[data-ikas-tab=overview]').click()");
    const overviewShot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(__dirname,'../output/ikas-overview-preview.png'),Buffer.from(overviewShot.data,'base64'));
    assert.deepEqual(errors,[]);console.log('PASS: IKAS 181 controls, single maturity index and Keterangan, multiline autosave, Manage edits, New/Duplicate/delete year, isolated history, JSON export, desktop/tablet/mobile.');
  }finally{
    if(token)auth.destroySession(token);ws?.close();chrome?.kill();if(server){server.closeAllConnections();await Promise.race([new Promise(resolve=>server.close(resolve)),delay(3000)]);}await Promise.race([pool.end(),delay(3000)]);
    const resolved=path.resolve(profile);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-ikas-'))await fs.promises.rm(resolved,{recursive:true,force:true}).catch(()=>{});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
