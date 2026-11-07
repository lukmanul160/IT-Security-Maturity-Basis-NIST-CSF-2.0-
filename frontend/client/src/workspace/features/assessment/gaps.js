/**
 * Controller gap assessment: state, pemuatan API, edit/simpan dan event.
 * gap-model.js memetakan kontrol; gap-view.js merender DOM dan field.
 * updatedAt, ownership evidence dan permission tetap divalidasi server.
 */
const gapDecisionOptions = ['Comply','Partially Comply','Not Comply'];
const gapDetailFields = [["domain", "Domain"], ["sub", "Sub"], ["dimension", "People/ Process/ Technology"], ["gapNumber", "Gap Number"], ["client", "Client"], ["pic", "PIC"], ["initiative", "Initiative"], ["recommendation", "Recommendation"], ["yearOfInitiative", "Year of Initiative"], ["quarter", "Kuartal"], ["confirmation", "Konfirmasi"], ["supportingDocuments", "Evidence/ Dokumen Pendukung"], ["decisionNote", "Decision Note"]];
// Explicit findings are independent of maturity scores and free-form reasoning.
const assessmentGapState = new Map();
const gapPermissions = {csf:'assessment',privacy:'privacy-assessment',ikas:'ikas-assessment',iso27001:'iso27001','iso27001-soa':'iso27001-soa'};
let gapContext = null;
let gapPage = 1;
function gapRows(framework) { return assessmentGapState.get(framework)?.rows || []; }

/** Muat snapshot gap per framework; kegagalan disimpan sebagai error agar data lama tidak diam-diam dianggap kosong. */
async function loadAssessmentGaps(framework) {
  if (!canPerform(gapPermissions[framework],'read')) return;
  const previous=assessmentGapState.get(framework) || {};
  try {
    const response=await fetch(`/api/assessment-gaps/${framework}`,{cache:'no-store'});
    const body=await response.json();
    if(!response.ok) throw Error(body.error || 'Gap gagal dimuat.');
    assessmentGapState.set(framework,{rows:body,loaded:true,error:''});
  } catch(error) {assessmentGapState.set(framework,{...previous,error:error.message});}
  renderGapSummaries();
  renderAssessmentGapTabs();
  document.querySelectorAll(`[data-assessment-gaps="${framework}"][data-gap-control]`).forEach(button=>{
    const code=button.dataset.gapControl;
    const cell=button.closest('.assessment-gap-cell');if(cell)cell.outerHTML=assessmentGapButton(framework,code);
  });
}






document.addEventListener('input',event=>{if(event.target.matches('[data-gap-tab-search]')){event.target.closest('[data-gap-tab]').dataset.page='1';renderAssessmentGapTabs();}});
document.addEventListener('change',event=>{if(event.target.matches('[data-gap-tab-status]')){event.target.closest('[data-gap-tab]').dataset.page='1';renderAssessmentGapTabs();}});
async function openAssessmentGaps(frameworks,code='',filter='all',editOnly='') {
  const dialog=gapDialog();gapContext={frameworks:frameworks.split(','),code,filter,editing:editOnly||null,editOnly:!!editOnly};gapPage=1;
  $('gapDialogTitle').textContent=code?`Gap — ${code}`:'Pemantauan gap assessment';
  $('gapDialogMessage').textContent='Memuat gap...';if(!dialog.open)dialog.showModal();
  await Promise.all(gapContext.frameworks.map(loadAssessmentGaps));
  if(!dialog.open)return;
  renderGapDialog();
}
/** Simpan posisi/filter asal sebelum masuk editor agar selesai edit dapat kembali ke konteks semula. */
function beginAssessmentGapEdit(button) {
  const dialog=gapDialog();
  const returnTo={context:gapContext,page:gapPage,scrollTop:dialog.scrollTop,id:button.dataset.gapEdit};
  gapContext={frameworks:[button.dataset.gapFramework],code:button.dataset.gapControl,filter:'all',editing:button.dataset.gapEdit,returnTo};
  gapPage=1;
  $('gapDialogTitle').textContent=`Gap ? ${gapContext.code}`;
  renderGapDialog();
  dialog.scrollTop=0;
  $('assessmentGapForm')?.querySelector('textarea,select,input')?.focus({preventScroll:true});
}
function finishAssessmentGapEdit() {
  if(gapContext?.editOnly){gapDialog().close();return;}
  const returnTo=gapContext?.returnTo;
  if(!returnTo){gapContext.editing=null;renderGapDialog();return;}
  gapContext=returnTo.context;gapPage=returnTo.page;
  $('gapDialogTitle').textContent=gapContext.code?`Gap ? ${gapContext.code}`:'Pemantauan gap assessment';
  renderGapDialog();
  const dialog=gapDialog();
  const origin=[...dialog.querySelectorAll('[data-gap-edit]')].find(button=>button.dataset.gapEdit===returnTo.id);
  origin?.focus({preventScroll:true});
  dialog.scrollTop=returnTo.scrollTop;
}



async function populateGapEvidence() {
  const select=$('gapEvidenceSelect');if(!select)return;
  const search=$('gapEvidenceSearch'),status=$('gapEvidenceSearchStatus');
  select.disabled=true;status.textContent='Memuat evidence...';
  search.addEventListener('keydown',event=>{if(event.key==='Enter')event.preventDefault();});
  await refreshEvidenceLibrary();if(!select.isConnected)return;
  const files=[...selectableEvidenceRecords()];let page=1;
  const pager=document.createElement('div');pager.className='list-pagination';status.after(pager);
  pager.addEventListener('click',event=>{const button=event.target.closest('[data-file-page]');if(button){page=Number(button.dataset.filePage);filter();}});
  const filter=()=>{
    const matches=files.map((file,index)=>({file,index})).filter(({file})=>evidenceMatches(file,search.value));
    const pages=Math.max(1,Math.ceil(matches.length/8));page=Math.min(page,pages);
    pager.innerHTML=`<button type="button" data-file-page="${page-1}" ${page===1?'disabled':''}>Previous</button><span>${page} / ${pages}</span><button type="button" data-file-page="${page+1}" ${page===pages?'disabled':''}>Next</button>`;
    select.innerHTML='<option value="">'+(matches.length?'Pilih file...':'Tidak ada file yang sesuai pencarian')+'</option>'+matches.slice((page-1)*8,page*8).map(({file,index})=>`<option value="${index}">${escapeHtml(file.name)}${file.source?' — '+escapeHtml(file.source):''}</option>`).join('');
    select.disabled=!matches.length;
    status.textContent=evidenceLibraryError || `${matches.length} dari ${files.length} file tersedia`;
  };
  search.addEventListener('input',()=>{page=1;filter();});filter();
  select.onchange=()=>{const file=files[Number(select.value)];if(select.value!==''&&file&&!gapContext.draftEvidence.some(item=>item.path===file.path)){gapContext.draftEvidence.push(evidenceReference(file));renderGapDraftEvidence();}select.value='';};
  if(evidenceLibraryError)$('gapDialogMessage').textContent=evidenceLibraryError;
}
function updateGapNumberPreview() {
  const form=$('assessmentGapForm');if(!form)return;
  const mode=form.elements.gapNumberMode.value,number=form.elements['gap-gapNumber'];
  number.readOnly=mode==='auto';number.required=mode==='manual';
  if(mode!=='auto')return;
  const sub=form.elements['gap-sub'].value.trim().toUpperCase(),dimension=form.elements['gap-dimension'].value;
  const tag={People:'PE',Process:'PR',Technology:'T'}[dimension];
  if(!sub||!tag){number.value='';number.placeholder='Pilih Sub dan kategori';return;}
  const prefix=`G-${sub}-${tag}-`,row=gapContext.editingRow;
  if(row?.details?.gapNumber?.startsWith(prefix)){number.value=row.details.gapNumber;return;}
  const used=gapRows(gapContext.frameworks[0]).filter(item=>item.id!==row?.id).map(item=>(item.details?.gapNumber||'').toUpperCase());
  let last=0;for(const value of used)if(value.startsWith(prefix)&&/^\d+$/.test(value.slice(prefix.length)))last=Math.max(last,Number(value.slice(prefix.length)));
  number.value=prefix+String(last+1).padStart(2,'0');
}
/** Upload bukti bila ada, lalu simpan gap dengan updatedAt untuk mendeteksi konflik; error mempertahankan editor. */
async function saveAssessmentGap(event) {
  event.preventDefault();const form=event.target, context=gapContext,framework=context.frameworks[0],row=context.editingRow;
  const button=form.querySelector('[type="submit"]');button.disabled=true;$('gapDialogMessage').textContent='Menyimpan gap...';
  try {
    const files=[...(form.elements.files?.files||[])];
    if(files.length) {
      const source=framework==='iso27001'?'ISO 27001':framework==='iso27001-soa'?'ISO 27001 SOA':framework==='privacy'?'ID-P':'Govern';
      const uploaded=await saveFilesToServer(source,'practice',files);
      context.draftEvidence.push(...uploaded);form.elements.files.value='';renderGapDraftEvidence();
    }
    const response=await fetch(`/api/assessment-gaps/${framework}/${encodeURIComponent(context.code)}${row?'/'+row.id:''}`,{method:row?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({details:{...Object.fromEntries(gapDetailFields.map(([key])=>[key,form.elements['gap-'+key].value])),gapNumberMode:form.elements.gapNumberMode?.value || 'manual'},description:form.elements.description.value,status:form.elements.status.value,evidence:context.draftEvidence,updatedAt:row?.updatedAt})});
    const body=await response.json();if(!response.ok)throw Error(body.error||'Gap gagal disimpan.');
    await loadAssessmentGaps(framework);
    if(gapContext===context)finishAssessmentGapEdit();
    window.dispatchEvent(new CustomEvent('assessment-gaps-changed',{detail:{framework}}));
  }catch(error){$('gapDialogMessage').textContent=error.message;}finally{button.disabled=false;}
}
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-gap-export')) { for(const framework of button.closest('[data-gap-tab]').dataset.gapTab.split(',')) { try { const response=await fetch(`/api/assessment-gaps/${framework}/export.xlsx`);if(!response.ok)throw Error('Export gap gagal.');const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=`gap-${framework}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000); } catch(error) { alert(error.message); } } }
  if(button.dataset.gapTabPage){button.closest('[data-gap-tab]').dataset.page=button.dataset.gapTabPage;renderAssessmentGapTabs();}
  if(button.hasAttribute('data-gap-tab-refresh'))void Promise.all(button.closest('[data-gap-tab]').dataset.gapTab.split(',').map(loadAssessmentGaps));
  if(button.dataset.assessmentGaps)void openAssessmentGaps(button.dataset.assessmentGaps,button.dataset.gapControl,'all',button.dataset.gapEditOnly);
  if(button.dataset.gapMonitor)void openAssessmentGaps(button.dataset.gapMonitor,'',button.dataset.gapFilter);
  if(button.dataset.gapRefresh)void Promise.all(button.dataset.gapRefresh.split(',').map(loadAssessmentGaps));
  if(button.hasAttribute('data-gap-close'))$('assessmentGapDialog').close();
  if(button.dataset.gapPage){gapPage=Number(button.dataset.gapPage);renderGapDialog();}
  if(button.dataset.gapEdit)beginAssessmentGapEdit(button);
  if(button.hasAttribute('data-gap-cancel-edit'))finishAssessmentGapEdit();
  if(button.hasAttribute('data-gap-unlink')){gapContext.draftEvidence.splice(Number(button.dataset.gapUnlink),1);renderGapDraftEvidence();}
  if(button.dataset.gapDelete && confirm('Hapus gap ini? File evidence tetap tersedia di library.')){
    button.disabled=true;
    try{const row=gapRows(button.dataset.gapFramework).find(item=>item.id===button.dataset.gapDelete);const response=await fetch(`/api/assessment-gaps/${row.framework}/${encodeURIComponent(row.controlCode)}/${row.id}`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({updatedAt:row.updatedAt})});if(!response.ok)throw Error((await response.json()).error||'Hapus gap gagal.');await loadAssessmentGaps(row.framework);renderGapDialog();window.dispatchEvent(new CustomEvent('assessment-gaps-changed',{detail:{framework:row.framework}}));}catch(error){$('gapDialogMessage').textContent=error.message;}finally{button.disabled=false;}
  }
});
