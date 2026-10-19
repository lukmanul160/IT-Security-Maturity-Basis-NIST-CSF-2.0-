let library;
let editorSequence=0;
function loadLibrary(){
  if(!library)library=new Promise((resolve,reject)=>{
    const style=document.createElement('link');style.rel='stylesheet';style.href='/statement-assets/superdoc.css';document.head.append(style);
    const script=document.createElement('script');script.src='/statement-assets/superdoc.min.js';script.onload=resolve;script.onerror=()=>{library=null;reject(new Error('Editor belum siap. Tutup lalu buka kembali.'));};document.head.append(script);
  });
  return library;
}

export async function mount({container,toolbar,buffer,name,onChange,user}) {
  await loadLibrary();
  const SuperDoc=window.SuperDoc.SuperDoc||window.SuperDoc.default||window.SuperDoc;
  const suffix=++editorSequence;
  container.id='statementWordCanvasHost'+suffix;toolbar.id='statementWordToolbarHost'+suffix;
  let instance,ready=false;
  await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(new Error('Editor belum siap. Tutup lalu buka kembali.')),60000);
    instance=new SuperDoc({
      selector:'#'+container.id,
      document:new File([buffer],name||'template.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),
      documentMode:'editing',
      user:{name:user.fullName||user.username||'Administrator'},
      telemetry:{enabled:false},
      toolbar:'#'+toolbar.id,
      modules:{comments:false},
      onReady:()=>{ready=true;clearTimeout(timeout);resolve();},
      onEditorUpdate:()=>{if(ready)onChange?.();},
      onContentError:({error})=>{clearTimeout(timeout);reject(error||new Error('Dokumen tidak dapat dibuka di editor.'));},
      onException:({error})=>{clearTimeout(timeout);reject(error||new Error('Dokumen tidak dapat dibuka di editor.'));},
    });
  }).catch(error=>{instance?.destroy();throw error;});
  return {
    async export(){
      // SuperDoc.export can silently return the original file after an export error.
      // Export the live editor directly so failure cannot be mistaken for a save.
      const editor=instance.activeEditor;
      if(!editor?.exportDocx)throw new Error('Klik dokumen sebelum menyimpan.');
      const file=await editor.exportDocx({isFinalDoc:false,commentsType:'external'});
      if(!(file instanceof Blob))throw new Error('Dokumen tidak dapat diekspor.');
      return file;
    },
    destroy(){instance.destroy();container.replaceChildren();toolbar.replaceChildren();},
    insert(value){const editor=instance.activeEditor;if(!editor?.chain)throw new Error('Klik posisi isian di dokumen terlebih dahulu.');editor.focus();editor.chain().insertContent({type:'text',text:value}).run();onChange?.();},
  };
}
