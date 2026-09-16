(async () => {
  const chrome = spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port='+debugPort,'--user-data-dir='+profilePath,'about:blank'],{stdio:'ignore',windowsHide:true});
  let client;
  try {
    await waitForChrome();
    const url = require('node:url').pathToFileURL(path.resolve('output/feature-guide/PANDUAN_FITUR.html')).href;
    const target = await (await fetch('http://127.0.0.1:'+debugPort+'/json/new?'+encodeURIComponent(url),{method:'PUT'})).json();
    client = new CdpClient(target.webSocketDebuggerUrl); await client.connect(); await client.send('Page.enable');
    await waitFor(client,'document.querySelectorAll("article section").length === 18','guide content');
    const checked = await evaluate(client, `(async()=>{const images=[...document.images];for(const image of images) image.loading='eager';await Promise.all(images.map(image=>image.decode()));return {sections:document.querySelectorAll('article section').length,images:images.length,broken:images.filter(image=>!image.naturalWidth).length}})()`);
    assert.equal(checked.images,31); assert.equal(checked.broken,0);
    const pdf = await client.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
    await fs.writeFile('output/feature-guide/PANDUAN_FITUR.pdf',Buffer.from(pdf.data,'base64'));
    console.log(JSON.stringify({status:'verified',...checked,pdf:'PANDUAN_FITUR.pdf'}));
  } finally {client?.close();chrome.kill();await delay(500);await removeBrowserProfile();}
})().catch(error=>{console.error(error);process.exitCode=1});
