(async()=>{
  const origin=baseUrl;
  const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+debugPort,'--user-data-dir='+profilePath,'about:blank'],{stdio:'ignore',windowsHide:true});
  let client;const errors=[];
  try {
    const html=await(await fetch(origin+'/')).text();assert.equal((html.match(/data:image\/webp;base64,/g)||[]).length,12);
    assert.equal((await fetch(origin+'/api/risk-management')).status,401);
    const protectedRoute=await fetch(origin+'/app',{redirect:'manual'});assert.equal(protectedRoute.status,302);assert.equal(protectedRoute.headers.get('location'),'/login');
    await waitForChrome();
    const target=await(await fetch('http://127.0.0.1:'+debugPort+'/json/new?'+encodeURIComponent(origin),{method:'PUT'})).json();
    client=new CdpClient(target.webSocketDebuggerUrl);await client.connect();await client.send('Page.enable');await client.send('Runtime.enable');
    client.on('Runtime.exceptionThrown',event=>errors.push(event.exceptionDetails?.text));
    await client.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await waitFor(client,'document.querySelectorAll(".catalog-item").length===17','catalog');
    const loaded=await evaluate(client,`(async()=>{const images=[...document.querySelectorAll('.gallery-image img')];images.forEach(img=>img.loading='eager');await Promise.all(images.map(img=>img.decode()));return images.length})()`);assert.equal(loaded,12);
    assert.equal(await evaluate(client,`(()=>{const x=document.querySelector('#catalog-search');x.value='SMTP';x.dispatchEvent(new Event('input'));return document.querySelectorAll('.catalog-item:not([hidden])').length})()`),1);
    assert.equal(await evaluate(client,`(()=>{const x=document.querySelector('#catalog-search');x.value='not-found-unique';x.dispatchEvent(new Event('input'));return !document.querySelector('#catalog-empty').hidden})()`),true);
    await evaluate(client,`const search=document.querySelector('#catalog-search');search.value='';search.dispatchEvent(new Event('input'));document.querySelector('[data-catalog-filter="risk"]').click();`);
    assert.equal(await evaluate(client,'document.querySelectorAll(".catalog-item:not([hidden])").length'),5);
    await evaluate(client,'document.querySelector("[data-catalog-filter=all]").click();document.querySelector("[data-gallery-filter=assessment]").click()');
    assert.equal(await evaluate(client,'document.querySelectorAll(".gallery-card:not([hidden])").length'),4);
    await evaluate(client,'document.querySelector(".gallery-open").click()');
    assert.equal(await evaluate(client,'document.querySelector("#screenshot-dialog").open'),true);
    await evaluate(client,'document.querySelector("#screenshot-image").decode()');
    await evaluate(client,'document.querySelector("#screenshot-next").click()');
    assert.equal(await evaluate(client,'document.querySelector("#screenshot-title").textContent'),'NIST Privacy');
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37});
    assert.equal(await evaluate(client,'document.querySelector("#screenshot-title").textContent'),'Dashboard NIST CSF');
    await client.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await client.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await waitFor(client,'!document.querySelector("#screenshot-dialog").open&&!document.body.classList.contains("screenshot-open")','dialog close');
    assert.equal(await evaluate(client,'!document.querySelector("#screenshot-dialog").open&&!document.body.classList.contains("screenshot-open")'),true);
    const ids=await evaluate(client,`(()=>{const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);return ids.filter((id,i)=>ids.indexOf(id)!==i)})()`);assert.deepEqual(ids,[]);
    for(const width of [1440,768,390]){
      await client.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
      for(const section of ['fitur-lengkap','galeri']){
        await evaluate(client,`document.getElementById('${section}').scrollIntoView({behavior:'instant',block:'start'})`);await delay(250);
        assert.equal(await evaluate(client,'document.documentElement.scrollWidth>innerWidth+1'),false,'overflow '+width);
        const image=await client.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile('output/landing-preview/'+section+'-'+width+'.png',Buffer.from(image.data,'base64'));
      }
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({passed:true,catalog:17,screenshots:12,search:true,filters:true,lightbox:true,keyboard:true,embeddedPreviews:true,protectedApp:true,viewports:[1440,768,390]}));
  } finally {client?.close();chrome.kill();await delay(500);await removeBrowserProfile();}
})().catch(error=>{console.error(error);process.exitCode=1});
