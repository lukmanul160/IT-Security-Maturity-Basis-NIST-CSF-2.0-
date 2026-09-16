async function capturePublicPreviews() {
  const read = async name => JSON.parse(await fs.readFile('data/'+name+'.json','utf8'));
  const csf = await read('csf-data'), privacy = await read('privacy-data');
  const iso = await read('iso-27001-data'), soa = await read('iso-27001-soa-data');
  const assessment = rows => ({scores:{},notes:{},attachments:{},targetScores:{},policyScores:Object.fromEntries(rows.slice(0,Math.ceil(rows.length*.7)).map((r,i)=>[r.id,3+i%2])),practiceScores:Object.fromEntries(rows.slice(0,Math.ceil(rows.length*.6)).map((r,i)=>[r.id,2+i%3]))});
  const keys = ['framework','csf','privacy','iso27001','iso27001-soa','assessment','privacy-assessment','risk-acceptance','risk-management','policy-register','personnel-certification','tprm','tprm-tiering','tprm-questionnaire','questionnaire-templates','tprm-register','files','backups','account'];
  const riskRows = ['Layanan pelanggan','Portal internal','Penyimpanan dokumen'].map((name,i)=>({riskId:'CSR - 00'+(i+1),riskCategory:'Operational',effectedAsset:'Sistem informasi',deviceName:name,identificationRisk:'Ketersediaan layanan dan perlindungan data',riskOwner:'Tim IT',likelihood:3,impact:4,riskRating:'High',treatmentAction:i===0?'Mitigation':'Transfer',deadline:'2026-12-01',residualRating:'Medium',assetValue:9}));
  const payloads = {
    '/api/auth/me':{username:'demo',fullName:'Workspace Demo',role:'admin',permissions:keys},
    '/api/auth/permissions':{permissions:keys.map(key=>[key,key]),assignments:keys.flatMap(key=>['admin','editor','approver','viewer','user'].map(role=>({role,permissionKey:key,allowed:true})))},
    '/api/auth/users':[{id:1,username:'demo',fullName:'Workspace Demo',role:'admin'}],
    '/api/frameworks':[{id:'csf',name:'NIST CSF',version:'2.0'},{id:'privacy',name:'Privacy Framework',version:'1.0'},{id:'iso27001',name:'ISO 27001',version:'2022'}],
    '/api/csf':csf, '/api/privacy':privacy,
    '/api/frameworks/csf/controls':csf, '/api/frameworks/privacy/controls':privacy,
    '/api/frameworks/iso27001/controls':iso.map(row=>({...row,evidence:[]})),
    '/api/frameworks/iso27001-soa/controls':soa.map(row=>({...row,evidence:[],applicability:'Applicable'})),
    '/api/assessment':assessment(csf), '/api/privacy/assessment':assessment(privacy),
    '/api/risk-management':riskRows,
    '/api/risk-management/dashboard':{total:3,ratings:{High:3},treatments:{Mitigation:1,Transfer:2},overdue:0,highResidual:0},
    '/api/policy-register':[{id:1,title:'Kebijakan Keamanan Informasi — Demo',category:'Information Security',owner:'Tim Governance',reviewCycle:'Annual',approvalStatus:'Approved',lastReview:'2026-09-01',notes:'Contoh tampilan kebijakan',items:[],attachmentPath:'',attachmentName:''}],
    '/api/personnel-certifications/organization-personnel':[{id:1,personnelName:'Personel Demo',employeeId:'DEMO-001',personnelRole:'Security Analyst',supervisorName:'Koordinator Demo'}],
    '/api/personnel-certifications':[{id:1,personnelId:1,personnelName:'Personel Demo',employeeId:'DEMO-001',personnelRole:'Security Analyst',supervisorName:'Koordinator Demo',certificationName:'Security+',issuer:'CompTIA',certificationLevel:'Entry Level',status:'Active',issueDate:'2026-01-01',expiryDate:'2029-01-01',onCanvas:true,positionX:24,positionY:24,cardWidth:260,cardHeight:190}],
    '/api/tprm-questionnaires':[{id:1,vendorName:'Vendor Demo',assessmentStatus:'Complete',assessmentResult:'Approved',reviewDate:'2026-12-01',piiExposure:4,securityMaturity:4,financialStability:4,reputationReferences:4,totalScore:400,riskTier:'Tier 3 (Low)'}],
    '/api/tprm':[{id:1,thirdParty:'Vendor Demo',questionnaireId:1,serviceDependency:'Layanan cloud — contoh',riskLevel:'Low Risk (Tier 3)',relationshipStatus:'Active',assessmentStatus:'Complete',nextReview:'2026-12-01',riskRegisterIds:[],dueDiligenceAssessment:{}}]
  };
  const chrome = spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+debugPort,'--user-data-dir='+profilePath,'about:blank'],{stdio:'ignore',windowsHide:true});
  let client; const manifest=[], errors=[];
  try {
    await waitForChrome();
    const target=await(await fetch('http://127.0.0.1:'+debugPort+'/json/new?'+encodeURIComponent(baseUrl+'/login'),{method:'PUT'})).json();
    client=new CdpClient(target.webSocketDebuggerUrl); await client.connect(); await client.send('Page.enable'); await client.send('Runtime.enable');
    client.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.exception?.description||event.exceptionDetails?.text));
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    // Only this isolated browser receives synthetic API responses. Nothing is written to the database.
    await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`(() => {const data=${JSON.stringify(payloads)};const original=window.fetch.bind(window);window.fetch=async(input,options={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.origin===location.origin&&url.pathname.startsWith('/api/')){if((options.method||'GET')!=='GET')return new Response(JSON.stringify({error:'Read-only screenshot session'}),{status:403,headers:{'Content-Type':'application/json'}});return new Response(JSON.stringify(data[url.pathname]??[]),{status:200,headers:{'Content-Type':'application/json'}});}return original(input,options)};})()`});
    await waitFor(client,'document.querySelector("#loginForm")','login');
    await evaluate(client,`document.querySelector('#username').value=${JSON.stringify(username)};document.querySelector('#password').value=${JSON.stringify(password)};document.querySelector('#loginForm').requestSubmit();`);
    await waitFor(client,'location.pathname==="/app" && document.documentElement.dataset.frontend==="vue"','workspace',30000);await delay(1200);
    await fs.mkdir('frontend/public/landing-media',{recursive:true});
    const snap=async(slug,title,view,tabAttribute,tabValue)=>{
      await evaluate(client,view==='account'?'document.querySelector("#accountButton").click()':`document.querySelector('[data-view="${view}"]').click()`);
      await delay(400);
      if(tabAttribute)await evaluate(client,`document.querySelector('[${tabAttribute}="${tabValue}"]').click()`);
      await delay(600);
      await evaluate(client,`window.scrollTo(0,0);document.querySelector('#mainContent')?.scrollTo(0,0);document.querySelector('#currentUser').textContent='Workspace Demo';document.querySelector('#saveState').textContent='Pratinjau • Data demo';`);
      const result=await client.send('Page.captureScreenshot',{format:'webp',quality:82,captureBeyondViewport:false});
      await fs.writeFile('frontend/public/landing-media/'+slug+'.webp',Buffer.from(result.data,'base64'));
      manifest.push({slug,title});console.log('Preview '+slug);
    };
    await snap('csf','Dashboard NIST CSF','csf','data-csf-tab','overview');
    await snap('privacy','Dashboard NIST Privacy','privacy','data-privacy-tab','overview');
    await snap('iso','Dashboard ISO 27001','iso27001','data-iso-tab','dashboard');
    await snap('soa','Statement of Applicability','iso27001','data-iso-tab','soa');
    await snap('risk','Risk Management','risk-management','data-risk-tab','register');
    await snap('acceptance','Risk Acceptance','risk-acceptance');
    await snap('policy','Policy Register','policy-register','data-policy-tab','register');
    await snap('personnel','Personnel Certification','personnel-certification','data-personnel-tab','organization');
    await snap('tprm','TPRM Risk Register','tprm-register');
    await snap('questionnaire','Due Diligence Questionnaire','tprm-questionnaire');
    await snap('evidence','Uploaded Files','files');
    await snap('access','Role Access','account','data-account-tab','permissions');
    await fs.writeFile('output/landing-preview/manifest.json',JSON.stringify({data:'Synthetic demo, no operational records',manifest,errors},null,2));
    if(errors.length)throw new Error(errors.join('\n'));
  } finally {client?.close();chrome.kill();await delay(500);await removeBrowserProfile();}
}
capturePublicPreviews().catch(error=>{console.error(error);process.exitCode=1});
