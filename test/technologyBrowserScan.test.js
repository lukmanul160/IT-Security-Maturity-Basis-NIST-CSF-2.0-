/** Real Chrome with entirely injected website responses. No installation DB or live website requests. */
const test=require('node:test'),assert=require('node:assert/strict');
const browser=require('../src/services/technologyBrowserScanService');
test('runtime signatures merge versions without making up unknown values',()=>{
 const found=browser.mergeTechnologies([{name:'Angular',version:'',source:'scan'}],browser.runtimeTechnologies({angular:'15.2.9',zone:true,litHtml:['3.3.3'],litElement:['4.2.2'],maps:true}));
 assert.equal(found.filter(t=>t.name==='Angular').length,1);assert.equal(found.find(t=>t.name==='Angular').version,'15.2.9');assert.equal(found.find(t=>t.name==='Zone.js').version,'');assert.equal(found.find(t=>t.name==='lit-html').version,'3.3.3');
});
test('isolated Chrome detects rendered DOM and JS globals while blocking POST and metadata requests',{timeout:40000},async()=>{
 const requested=[];
 const result=await browser.scan('https://fixture.example/',{
  resolve:async()=>[{address:'8.8.8.8',family:4}],
  request:async destination=>{
   requested.push(destination.url.href);
   const html=destination.url.pathname==='/runtime.js'?`window.Zone={};window.litHtmlVersions=['3.3.3'];window.litElementVersions=['4.2.2'];window.google={maps:{}};setTimeout(()=>document.querySelector('app-root').setAttribute('ng-version','15.2.9'),150);fetch('/mutation',{method:'POST'}).catch(()=>{});const s=document.createElement('script');s.src='http://169.254.169.254/latest/meta-data';document.head.append(s);`:'<html><head><meta property="og:title" content="Fixture"><link rel="stylesheet" href="https://fonts.googleapis.com/css"><script src="/runtime.js"></script></head><body><app-root></app-root></body></html>';
   return {status:200,headers:{'content-type':destination.url.pathname==='/runtime.js'?'text/javascript':'text/html',server:'nginx/1.24.0'},html,htmlBytes:Buffer.byteLength(html)};
  },
 });
 assert.equal(result.mode,'browser');assert.equal(result.status,200);
 for(const [name,version] of [['Angular','15.2.9'],['Zone.js',''],['lit-html','3.3.3'],['lit-element','4.2.2'],['Google Maps',''],['Open Graph',''],['Google Font API','']])assert.ok(result.technologies.some(t=>t.name===name&&t.version===version),name);
 assert.equal(requested.some(url=>url.includes('169.254.169.254')||url.includes('/mutation')),false);
 assert.ok(result.blockedRequests>=2);assert.equal(JSON.stringify(result).includes('window.Zone'),false);
});


test('browser refuses script-driven navigation to a different internal application',{timeout:40000},async()=>{
 const requested=[];
 await assert.rejects(browser.scan('http://erp.internal/',{resolve:async()=>[{address:'10.0.0.8',family:4}],request:async destination=>{requested.push(destination.url.href);const html='<script>location.href="http://other.internal/private"</script>';return {status:200,headers:{'content-type':'text/html'},html,htmlBytes:html.length};}}),error=>error.status===400&&/Navigasi/.test(error.message));
 assert.deepEqual(requested,['http://erp.internal/']);
});

test('browser channel aborts oversized page-controlled runtime snapshots',{timeout:40000},async()=>{
 await assert.rejects(browser.scan('https://fixture.example/',{resolve:async()=>[{address:'8.8.8.8',family:4}],request:async()=>{const html='<script>window.litHtmlVersions=[];window.litHtmlVersions.slice=()=>["x".repeat(3*1024*1024)]</script>';return {status:200,headers:{'content-type':'text/html'},html,htmlBytes:html.length};}}),{status:504});
});


test('browser recognizes broad technology categories from a rendered page and retains version evidence',{timeout:40000},async()=>{
 const html=`<html><head><meta property="og:title" content="Fixture"><link rel="manifest" href="/manifest.json"><style data-styled-version="6.3.8" data-styled></style><style data-emotion="css"></style></head><body><div class="fa fa-home"></div><div class="swiper-wrapper"></div><script>window.next={version:'12.3.7'};window.__NEXT_DATA__={};window.google_tag_manager={};window.__cfBeaconCustomTag=true;window.GoogleAnalyticsObject='ga';function gtag(){};gtag('config','G-EXAMPLE');</script></body></html>`;
 const result=await browser.scan('https://fixture.example/',{resolve:async()=>[{address:'8.8.8.8',family:4}],request:async()=>({status:200,headers:{'content-type':'text/html',server:'cloudflare'},html,htmlBytes:Buffer.byteLength(html)})});
 for(const name of ['Cloudflare Browser Insights','Google Analytics','styled-components','React','Emotion','Next.js','Font Awesome','PWA','Open Graph','Cloudflare','Google Tag Manager','Swiper'])assert.ok(result.technologies.some(t=>t.name===name),name);
 assert.equal(result.technologies.find(t=>t.name==='Next.js').version,'12.3.7');assert.equal(result.technologies.find(t=>t.name==='styled-components').version,'6.3.8');assert.equal(result.technologies.find(t=>t.name==='Google Analytics').version,'GA4');
 assert.ok(result.engine.signatures>=16);assert.equal(JSON.stringify(result).includes('G-EXAMPLE'),false);
});

test('HTTP denial pages never become an application framework inventory',{timeout:40000},async()=>{
 const html='<div ng-version="99.0.0"></div><script>window.React={version:"99.0.0"}</script>';
 const result=await browser.scan('https://fixture.example/',{resolve:async()=>[{address:'8.8.8.8',family:4}],request:async()=>({status:403,headers:{'content-type':'text/html',server:'cloudflare'},html,htmlBytes:html.length})});
 assert.equal(result.accessRestricted,true);assert.equal(result.partial,true);assert.ok(result.technologies.some(t=>t.name==='Cloudflare'));assert.equal(result.technologies.some(t=>['React','Angular'].includes(t.name)),false);
});


test('runtime timeout preserves header results and reports the stage with live progress',{timeout:40000},async()=>{
 const stages=[];
 const html='<html><body><script>Object.defineProperty(window,"React",{get(){while(true){}}})</script></body></html>';
 const result=await browser.scan('https://fixture.example/',{onProgress:event=>stages.push(event),resolve:async()=>[{address:'8.8.8.8',family:4}],request:async()=>({status:200,headers:{'content-type':'text/html',server:'nginx/1.24.0'},html,htmlBytes:html.length})});
 assert.equal(result.partial,true);assert.ok(['runtime','dom'].includes(result.timeoutStage));assert.ok(result.technologies.some(t=>t.name.toLowerCase()==='nginx'));for(const stage of ['validating','starting','navigation','runtime','dom','signatures'])assert.ok(stages.some(item=>item.stage===stage),stage);
});
