/* Shared Word preview, isolated from dashboard styles. */
window.StatementWord = (() => {
  const states = new WeakMap();
  async function render(buffer, host) {
    let state = states.get(host);
    if (!state) {
      const root = host.attachShadow({mode:'open'});
      const style = document.createElement('style');
      style.textContent = ':host{display:block;overflow:auto;max-width:100%;background:#e7edf5;border-radius:8px} .paper-content{width:100%} .docx-wrapper{padding:20px!important} .docx-wrapper>section{box-shadow:0 3px 16px #182b4620!important;margin-bottom:20px!important}';
      const content=document.createElement('div');content.className='paper-content';root.append(style,content);
      state={content,version:0};states.set(host,state);
      state.observer=new ResizeObserver(()=>fit(host,state));state.observer.observe(host);
    }
    const version=++state.version;
    const temporary=document.createElement('div');
    const options={inWrapper:true,ignoreLastRenderedPageBreak:false,renderHeaders:true,renderFooters:true,renderAltChunks:false,useBase64URL:true,breakPages:true};
    const documentModel=await docx.parseAsync(buffer,options);
    // docx-preview ignores wp:align on wrapNone drawings. Honor the header's
    // right-margin anchor without changing any bytes in the Word document.
    const zip=await JSZip.loadAsync(buffer);
    const wp='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
    for(const part of documentModel.parts.filter(p=>p.rootElement?.type==='header')){
      const entry=zip.file(part.path);if(!entry)continue;
      const xml=new DOMParser().parseFromString(await entry.async('string'),'application/xml');
      const drawings=[...xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','drawing')];
      let index=0;
      function visit(node,paragraph){
        if(node.type==='paragraph')paragraph=node;
        if(node.type==='drawing'){
          const drawing=drawings[index++],anchor=drawing?.getElementsByTagNameNS(wp,'anchor')[0];
          const horizontal=anchor?.getElementsByTagNameNS(wp,'positionH')[0];
          const align=horizontal?.getElementsByTagNameNS(wp,'align')[0]?.textContent;
          if(anchor&&align==='right'&&['margin','column'].includes(horizontal.getAttribute('relativeFrom'))){
            const extent=anchor.getElementsByTagNameNS(wp,'extent')[0];
            paragraph.cssStyle={...paragraph.cssStyle,position:'relative'};
            node.className=((node.className||'')+' statement-header-right').trim();
            node.cssStyle={...node.cssStyle,position:'absolute',display:'block',left:'auto',right:'0',top:'0',width:Number(extent.getAttribute('cx'))/12700+'pt',height:Number(extent.getAttribute('cy'))/12700+'pt'};
          }
        }
        for(const child of node.children||[])visit(child,paragraph);
      }
      visit(part.rootElement);
    }
    temporary.append(...await docx.renderDocument(documentModel,options));
    for(const drawing of temporary.querySelectorAll('header div[style]'))if(drawing.style.right==='0px'&&drawing.style.left==='auto')Object.assign(drawing.style,{position:'absolute',display:'block',left:'auto',right:'0',top:'0'});
    if(state.version!==version)return;
    state.content.replaceChildren(...temporary.childNodes);fit(host,state);
  }
  function fit(host,state){const wrapper=state.content.querySelector('.docx-wrapper');if(!wrapper)return;wrapper.style.zoom='1';const pages=[...wrapper.querySelectorAll('section.docx')];const width=Math.max(0,...pages.map(p=>p.getBoundingClientRect().width));if(width&&host.clientWidth)wrapper.style.zoom=String(Math.min(1,(host.clientWidth-40)/(width+40)));}
  async function responseBuffer(response){if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||'Gagal memuat dokumen Word.');}return response.arrayBuffer();}
  function fromBase64(base64){return Uint8Array.from(atob(base64),c=>c.charCodeAt(0));}
  function downloadLink(link,buffer,name){const old=link.dataset.blob;if(old)URL.revokeObjectURL(old);const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));link.dataset.blob=url;link.href=url;link.download=name;}
  async function print(host){const root=host.shadowRoot;if(!root)return;const popup=window.open('','_blank');if(!popup){window.alert('Izinkan jendela cetak dari browser untuk mencetak surat.');return;}popup.document.open();popup.document.write('<!doctype html><html><head><title>Surat pernyataan</title><style>@page{margin:0}body{margin:0}.docx-wrapper{padding:0!important;background:white!important;zoom:1!important}.docx-wrapper>section{box-shadow:none!important;margin:0!important;break-after:page}.docx-wrapper>section:last-child{break-after:auto}</style></head><body></body></html>');popup.document.close();for(const style of root.querySelectorAll('style'))popup.document.head.append(style.cloneNode(true));const content=root.querySelector('.paper-content').cloneNode(true);for(const wrapper of content.querySelectorAll('.docx-wrapper'))wrapper.style.zoom='1';popup.document.body.append(content);await Promise.all([...popup.document.images].map(img=>img.complete?Promise.resolve():new Promise(r=>{img.onload=r;img.onerror=r;})));await popup.document.fonts.ready;popup.focus();popup.print();}
  return {render,responseBuffer,fromBase64,downloadLink,print};
})();
