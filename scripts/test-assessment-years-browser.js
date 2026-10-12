// Browser fixtures intercept every assessment write; business data stays unchanged.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {pool}=require('../src/config/database');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
  let server,chrome,ws,token;
  const profile=path.join(os.tmpdir(),'nist-assessment-years-'+Date.now());
  const auth=require('../src/config/auth');
  try {
    const user=(await pool.query("SELECT username FROM app_users WHERE role='admin' LIMIT 1")).rows[0];assert.ok(user);
    token=auth.createSession({username:user.username,role:'admin'});
    server=require('../src/app').listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const portProbe=require('node:net').createServer();portProbe.listen(0,'127.0.0.1');await new Promise(r=>portProbe.once('listening',r));const port=portProbe.address().port;await new Promise(r=>portProbe.close(r));
    chrome=spawn(process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
    for(let i=0;i<80;i++){try{const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();ws=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);break;}catch{await delay(100);}}
    assert.ok(ws,'Chrome started');await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
    let id=0;const pending=new Map(),errors=[];
    ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){pending.get(message.id)(message);pending.delete(message.id);}if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);});
    const call=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,message=>message.error?reject(Error(message.error.message)):resolve(message.result));ws.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
    const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await delay(100);}throw Error('Wait failed: '+expression+' / '+JSON.stringify(errors));};
    await call('Runtime.enable');await call('Page.enable');await call('Network.enable');
    await call('Network.setCookie',{name:auth.sessionCookie,value:token,url:base,httpOnly:true});
    const templates=Object.fromEntries([['csf','csf-data.json'],['privacy','privacy-data.json'],['iso27001','iso-27001-data.json'],['iso27001-soa','iso-27001-soa-data.json']].map(([key,file])=>[key,JSON.parse(fs.readFileSync(path.join('data',file),'utf8'))]));
    const code=templates.csf.find(row=>row.id.startsWith('GV-')).id;
    await call('Page.addScriptToEvaluateOnNewDocument',{source:`{
      const original=window.fetch.bind(window),jobs=[];let active=0;
      const native=(input,options)=>new Promise((resolve,reject)=>{jobs.push({input,options,resolve,reject});pump();});
      function pump(){while(active<3&&jobs.length){const job=jobs.shift();active++;original(job.input,job.options).then(job.resolve,job.reject).finally(()=>{active--;pump();});}}
      const templates=${JSON.stringify(templates)},code=${JSON.stringify(code)};
      const empty=()=>({scores:{},policyScores:{},practiceScores:{},notes:{},attachments:{},targetScores:{}});
      const fresh={periods:{},data:{}};
      for(const group of ['csf','privacy','iso27001']){
        fresh.periods[group]=[{year:2026,legacy:true,mode:'legacy'}];
        const frameworks=group==='iso27001'?['iso27001','iso27001-soa']:[group];
        fresh.data[group]={2026:{assessment:empty(),controls:{},gaps:{},targets:{},objectives:[]}};
        const data=fresh.data[group][2026];
        for(const key of frameworks){data.controls[key]=templates[key].map(row=>({...row,notes:'Baseline 2026',evidence:[],applicability:'Applicable'}));data.gaps[key]=[];data.targets[key]=[...new Set(templates[key].map(row=>row.category))].map(category=>({category,targetScore:3}));}
        if(group==='csf'){data.assessment.policyScores[code]=4;data.assessment.practiceScores[code]=3;data.assessment.notes['policy-'+code]='Baseline 2026';}
      }
      const fixture=JSON.parse(sessionStorage.getItem('qa-assessment-years')||JSON.stringify(fresh));
      window.qaYearRequests=[];
      const save=()=>sessionStorage.setItem('qa-assessment-years',JSON.stringify(fixture));
      const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
      window.fetch=async(input,options={})=>{
        const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.origin),parts=url.pathname.split('/').filter(Boolean),method=options.method||'GET';
        if(parts[0]!=='api')return native(input,options);
        if(url.pathname==='/api/auth/me'){const keys=['framework','csf','privacy','assessment','privacy-assessment','iso27001','iso27001-soa','monitoring-dashboard','files','account','risk-management','policy-register','risk-acceptance','personnel-certification','tprm','tprm-tiering','tprm-register','tprm-questionnaire','questionnaire-templates','audit-finding-tracker'];return response({username:'Assessment Browser Fixture',fullName:'Assessment Browser Fixture',role:'admin',permissions:keys,actions:Object.fromEntries(keys.map(key=>[key,{read:true,create:true,update:true,delete:true}]))});}
        if(parts[1]==='assessment-periods'){
          const group=parts[2];if(method==='GET')return response(fixture.periods[group]);
          const body=JSON.parse(options.body);if(fixture.data[group][body.year])return response({error:'Tahun sudah tersedia'},409);
          const data=structuredClone(fixture.data[group][body.sourceYear]);
          if(body.mode==='new'){data.assessment=empty();data.objectives=[];for(const key of Object.keys(data.controls)){data.controls[key]=data.controls[key].map(row=>({...row,notes:'',evidence:[]}));data.gaps[key]=[];}}
          fixture.data[group][body.year]=data;fixture.periods[group].unshift({year:body.year,sourceYear:body.sourceYear,mode:body.mode,legacy:false});save();return response(body,201);
        }
        const framework=parts[1]==='assessment'?'csf':parts[1]==='assessment-gaps'||parts[1]==='frameworks'?parts[2]:['csf','privacy'].includes(parts[1])?parts[1]:null;
        if(!framework||!templates[framework])return native(input,options);
        const group=framework==='iso27001-soa'?'iso27001':framework,year=Number(url.searchParams.get('assessmentYear')||2026),data=fixture.data[group][year];
        window.qaYearRequests.push({path:url.pathname,year,method});if(!data)return response({error:'Missing fixture year'},404);
        if(parts[1]==='assessment'||parts[1]==='privacy'&&parts[2]==='assessment'){if(method==='PUT'){data.assessment=JSON.parse(options.body);save();}return response(data.assessment);}
        if(parts[1]==='assessment-gaps')return response(data.gaps[framework]);
        if(parts[1]==='frameworks'&&parts[3]==='targets')return response(data.targets[framework]);
        if(parts[1]==='frameworks'&&parts[3]==='objectives')return response(data.objectives);
        if(method!=='GET')throw Error('Unexpected assessment fixture write: '+url.pathname);
        return response(data.controls[framework]);
      };
    }`});
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await call('Page.navigate',{url:base+'/app'});
    await wait("document.documentElement?.dataset.frontend==='vue' && document.querySelector('#csfView [data-assessment-period] select')?.options.length===1");
    const toolbar=group=>`document.querySelector('#${group==='csf'?'csfView':group==='privacy'?'privacyView':'iso27001View'} [data-assessment-period]')`;
    const createYear=async(group,year,mode)=>{
      await wait(`${toolbar(group)}?.querySelector('button').disabled===false`);
      await evaluate(`document.querySelector('[data-view=${group}]').click();${toolbar(group)}.querySelector('button').click()`);
      await wait("!!document.querySelector('.assessment-year-dialog[open]')");
      await evaluate(`(()=>{const form=document.querySelector('.assessment-year-dialog form');form.elements.year.value=${year};form.elements.mode.value='${mode}';form.elements.mode.dispatchEvent(new Event('change'));form.requestSubmit();})()`);
      await wait(`document.documentElement?.dataset.frontend==='vue' && ${toolbar(group)}?.querySelector('select').value==='${year}' && !document.querySelector('.assessment-year-dialog[open]')`);
    };
    await createYear('csf',2027,'duplicate');
    await evaluate("document.getElementById('csfAssessmentButton').click()");
    await wait(`document.querySelector('[data-note="policy-${code}"]')?.value==='Baseline 2026'`);
    await evaluate(`(()=>{const input=document.querySelector('[data-note="policy-${code}"]');input.value='Changed in 2027';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await wait("qaYearRequests.some(request=>request.path==='/api/assessment'&&request.method==='PUT'&&request.year===2027)");
    await evaluate("(()=>{const select=document.querySelector('#assessmentView [data-assessment-period] select');select.value='2026';select.dispatchEvent(new Event('change'));})()");
    await wait(`document.documentElement?.dataset.frontend==='vue' && document.querySelector('#assessmentView [data-assessment-period] select')?.value==='2026' && document.querySelector('[data-note="policy-${code}"]')?.value==='Baseline 2026'`);
    await createYear('csf',2028,'new');
    await evaluate("document.getElementById('csfAssessmentButton').click()");
    await wait(`document.querySelector('[data-note="policy-${code}"]')?.value===''`);
    for(const group of ['privacy','iso27001']){await createYear(group,2027,'duplicate');await createYear(group,2028,'new');}
    await evaluate("document.querySelector('[data-view=csf]').click()");
    await wait("document.querySelector('#csfView [data-assessment-period] select')?.value==='2028'");
    const exported=await evaluate("moduleTransfer.collect('csf')");assert.equal(exported.assessmentYear,2028);assert.deepEqual(exported.data.assessment.notes,{});
    assert.equal(await evaluate("moduleTransfer.report('csf',{assessmentYear:2028,exportedAt:'QA',data:{assessment:{},gaps:[]}}).includes(' / 2028')"),true);
    await evaluate(`${toolbar('csf')}.querySelector('button').click()`);await wait("!!document.querySelector('.assessment-year-dialog[open]')");
    for(const width of [1440,768,390]){
      await call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await delay(150);
      assert.equal(await evaluate("document.querySelector('.assessment-year-dialog').scrollWidth>document.querySelector('.assessment-year-dialog').clientWidth+1"),false,'dialog fits '+width);
      assert.equal(await evaluate('document.documentElement.scrollWidth>document.documentElement.clientWidth+1'),false,'page fits '+width);
    }
    await evaluate("document.querySelector('[data-year-cancel]').click()");assert.deepEqual(errors,[]);
    console.log('PASS: annual selectors, Duplicate/New for CSF/Privacy/ISO/SOA, autosave isolation, reload persistence, historical data, year-aware exports, desktop/tablet/mobile. Assessment writes use browser fixtures only.');
  } finally {
    if(token)auth.destroySession(token);ws?.close();chrome?.kill();
    if(server){server.closeAllConnections();await Promise.race([new Promise(resolve=>server.close(resolve)),delay(3000)]);}await Promise.race([pool.end(),delay(3000)]);
    const resolved=path.resolve(profile);
    if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('nist-assessment-years-'))await fs.promises.rm(resolved,{recursive:true,force:true}).catch(()=>{});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
