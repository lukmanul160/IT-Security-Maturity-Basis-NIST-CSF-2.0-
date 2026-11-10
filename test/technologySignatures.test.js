/** Project-owned rules are evaluated with synthetic page observations; no external lookup or database. */
const test = require('node:test'), assert = require('node:assert/strict');
const signatures = require('../src/services/technologySignatureService');

test('local rules provide explicit DOM/JS observation plans', () => {
  assert.ok(signatures.load().count >= 16);
  const plan = signatures.browserPlan();
  assert.ok(plan.js.includes('next.version'));
  assert.ok(plan.js.includes('React.version'));
  assert.ok(plan.dom.some(rule => rule.selector === '[ng-version]'));
});

test('Project-owned rules detect the supplied technology categories and explicit versions', async () => {
  const result = await signatures.analyze({ url:'https://fixture.example/', html:'', headers:{server:'cloudflare'}, cookies:{_ga_example:''}, js:{'React.version':'18.2.0','next.version':'12.3.7',__NEXT_DATA__:'true',GoogleAnalyticsObject:'ga',google_tag_manager:'true',__cfBeaconCustomTag:'true',Swiper:'true'}, dom:{'style[data-styled-version]':[{attributes:{'data-styled-version':'6.3.8'},properties:{}}], 'style[data-emotion], style[data-emotion-css]':[{attributes:{},properties:{}}],"link[rel='manifest']":[{}],"meta[property*='og:']":[{}],"[class*='fa']":[{attributes:{class:'fa fa-home'}}]}, meta:{}, scriptSrc:['https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE'], scripts:[], css:[] });
  assert.equal(result.partial,false);
  for (const name of ['Cloudflare Browser Insights','Google Analytics','styled-components','React','Emotion','Next.js','Font Awesome','PWA','Open Graph','Cloudflare','Google Tag Manager','Swiper']) assert.ok(result.technologies.some(item => item.name === name),name);
  assert.equal(result.technologies.find(item=>item.name==='Next.js').version,'12.3.7');
  assert.equal(result.technologies.find(item=>item.name==='styled-components').version,'6.3.8');
  assert.equal(result.technologies.find(item=>item.name==='Google Analytics').version,'GA4');
  const next=result.technologies.find(item=>item.name==='Next.js');
  assert.ok(next.detection.categories.length>1);assert.equal(next.detection.inferred,false);
  assert.equal(JSON.stringify(result).includes('G-EXAMPLE'),false,'raw identifiers are not used as evidence');
});

test('inferred technologies are distinguished without guessing product versions',async()=>{
  const result=await signatures.analyze({js:{__NEXT_DATA__:'true'},dom:{},headers:{},meta:{},cookies:{}});
  const react=result.technologies.find(item=>item.name==='React');assert.ok(react);assert.equal(react.version,'');assert.equal(react.detection.inferred,true);assert.match(react.evidence,/Implied by/);
});


test('unrecognized content and invalid versions do not invent detections', async () => {
  const empty = await signatures.analyze({ html: 'React Next.js Cloudflare', js: {}, dom: {}, headers: {} });
  assert.deepEqual(empty.technologies, []);
  const invalid = await signatures.analyze({ js: { 'React.version': '<script>bad</script>' }, dom: {}, headers: {} });
  assert.deepEqual(invalid.technologies, []);
  assert.equal(empty.engine.name, 'NIST Basis');
  assert.equal(Object.hasOwn(empty.engine, 'license'), false);
});
