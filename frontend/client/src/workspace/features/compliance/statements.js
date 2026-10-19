;(() => {
  const key='surat-pernyataan', root=$('statementAdminView');
  const nav=document.querySelector('[data-view="surat-pernyataan"]');
  let controller,loading;
  function script(name){return new Promise((resolve,reject)=>{const element=document.createElement('script');element.src='/statement-assets/'+name;element.onload=resolve;element.onerror=()=>{element.remove();reject(new Error('Gagal memuat pengelolaan surat. Silakan muat ulang.'));};document.head.append(element);});}
  async function initialize(){
    if(controller)return controller;
    if(!loading)loading=(async()=>{
      const user=await workspaceUserReady;
      if(!canPerform(key,'read'))throw new Error('Anda tidak memiliki izin mengelola surat pernyataan.');
      if(!window.JSZip)await script('jszip.min.js');
      if(!window.docx)await script('docx-preview.min.js');
      if(!window.StatementWord)await script('common.js');
      if(!window.StatementEmployeesMount)await script('employees.js');
      if(!window.StatementMonitoringMount)await script('monitoring.js');
      if(!window.StatementAdminMount)await script('admin.js');
      controller=window.StatementAdminMount(root,user);return controller;
    })().catch(error=>{loading=null;throw error;});
    return loading;
  }
  async function show(){
    await workspaceUserReady;
    if(!canPerform(key,'read'))return;
    document.querySelectorAll('.view').forEach(view=>view.classList.toggle('active-view',view===root));
    document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item===nav));
    saveUiState(key);
    const status=root.querySelector('[data-statement-id="message"]');status.textContent='Memuat pengelolaan surat...';
    try{await (await initialize()).refresh();}catch(error){status.textContent=error.message;status.classList.add('error');}
  }
  nav.addEventListener('click',()=>void show());
  window.addEventListener('vue:workspace-ready',()=>{
    if(location.hash==='#surat-pernyataan'){
      history.replaceState(null,'',location.pathname+location.search);
      void show();
    }
  },{once:true});
})();
