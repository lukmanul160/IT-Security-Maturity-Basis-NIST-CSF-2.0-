let ikasRows=[],ikasState={scores:{},notes:{},attachments:{},targetScores:{},respondent:{}},ikasTemplate=null;
let ikasPage=1,ikasManagePage=1,ikasDomain='',ikasTab='overview',ikasSaveQueue=Promise.resolve();
const ikasInitialView=uiState.view;
const ikasDisplay=value=>value===null||value===undefined?'—':Number(value).toFixed(2);
function ikasStatus(message){$('ikasStatus').textContent=message;$('ikasManageStatus').textContent=message;$('saveState').textContent=message;}
async function ikasRequest(url,method='GET',body){
  const response=await fetch(url,{method,headers:body instanceof FormData?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body),cache:'no-store'});
  if(!response.ok)throw Error((await response.json().catch(()=>({}))).error||'Permintaan IKAS gagal.');
  return response.status===204?null:response.json();
}
function saveIkas(){
  const snapshot=structuredClone(ikasState);snapshot.respondent.D13=String(assessmentYears.ikas);ikasStatus('Saving...');
  const task=ikasSaveQueue.catch(()=>{}).then(()=>ikasRequest('/api/ikas/assessment','PUT',snapshot));
  ikasSaveQueue=task;assessmentPendingWrites.add(task);
  task.then(()=>{assessmentPendingWrites.delete(task);ikasStatus('Saved just now');},error=>{assessmentPendingWrites.delete(task);assessmentWriteErrors.add('ikas');ikasStatus(error.message);});
  return task;
}
async function loadIkas(){
  await ikasSaveQueue;
  const manager=canPerform('ikas','read'),assessment=canPerform('ikas-assessment','read');
  if(!manager&&!assessment)return;
  const values=await Promise.all([ikasRequest('/api/ikas-template'),manager?ikasRequest('/api/ikas'):Promise.resolve([]),assessment?ikasRequest('/api/ikas/assessment'):Promise.resolve(ikasState),assessment?ikasRequest('/api/frameworks/ikas/targets'):Promise.resolve([])]);
  ikasTemplate=values[0];ikasRows=values[1];ikasState=window.IkasScoring.normalize(values[2]);
  for(const target of values[3])ikasState.targetScores[target.category]=Number(target.targetScore);
  for(const id of ['ikasCoreDomain','ikasManageDomain']){const select=$(id),previous=select.value;select.innerHTML='<option value="all">Semua domain</option>'+ikasTemplate.domains.map(row=>`<option value="${escapeHtml(row.name)}">${escapeHtml(row.name)}</option>`).join('');select.value=[...select.options].some(row=>row.value===previous)?previous:'all';}
  $('ikasControlForm').elements.function.innerHTML=ikasTemplate.domains.map(row=>`<option>${escapeHtml(row.name)}</option>`).join('');
  renderIkas();renderIkasManage();renderIkasRespondent();if(assessment)await loadAssessmentGaps('ikas');
}
function ikasTarget(row){return ikasState.targetScores[row.category]??3;}
function ikasFiltered(rows,query,status){return rows.filter(row=>{
  const score=ikasState.scores[row.id]??null;
  return `${row.id} ${row.function} ${row.category} ${row.subcategory} ${row.implementation} ${row.ikas?.scope}`.toLowerCase().includes(query.toLowerCase())&&(status==='all'||status==='scored'&&score!==null||status==='unscored'&&score===null&&row.applicability!=='Not applicable'||status==='gaps'&&row.applicability!=='Not applicable'&&(score===null||score<ikasTarget(row)));
});}
function ikasScores(row){
  const score=ikasState.scores[row.id],editable=canPerform('ikas-assessment','update')&&row.applicability!=='Not applicable';
  return `<label class="ikas-index-field"><span>Indeks Nilai Kematangan</span><select data-ikas-index="${escapeHtml(row.id)}" aria-label="Indeks Nilai Kematangan ${escapeHtml(row.id)}" ${editable?'':'disabled'}><option value="">${row.applicability==='Not applicable'?'Not applicable':'Pilih indeks nilai kematangan'}</option>${[0,1,2,3,4,5].map(value=>`<option value="${value}" ${score===value?'selected':''}>Indeks ${value}</option>`).join('')}</select><small>${score===undefined?'Pilih nilai berdasarkan rubrik indeks 0-5.':escapeHtml(row.ikas?.rubric?.[score]||'')}</small></label>`;
}
function ikasEvidence(row){
  const key=row.id,files=ikasState.attachments[key]||[],editable=canPerform('ikas-assessment','update');
  return `<details class="ikas-evidence"><summary>Dokumen bukti (${files.length})</summary><div class="attachment-buttons"><label class="attachment-button">Tambah file<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp" multiple data-ikas-upload="${escapeHtml(key)}" ${editable?'':'disabled'}></label><button type="button" class="attachment-button" data-ikas-select-file="${escapeHtml(key)}" ${editable?'':'disabled'}>Pilih dokumen yang tersedia</button></div><div class="attachment-list">${files.map((file,index)=>`<div class="attachment-item"><span class="attachment-name">${escapeHtml(file.name)}</span><div class="attachment-actions"><a class="attachment-action-button" href="${apiFileOpenUrl(file.path)}" target="_blank" rel="noopener">Open</a><a class="attachment-action-button" href="${apiFileUrl(file.path)}" download="${escapeHtml(file.name)}">Download</a><label class="attachment-action-button attachment-action">Replace<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp" data-ikas-replace="${escapeHtml(key)}" data-index="${index}" ${editable?'':'disabled'}></label><button type="button" class="attachment-action-button danger" data-ikas-detach="${escapeHtml(key)}" data-index="${index}" ${editable?'':'disabled'}>Lepas referensi</button></div></div>`).join('')}</div></details>`;
}
function ikasControlCard(row){return `<article class="control-row ikas-control-row"><div class="ikas-control-heading"><div class="control-code">${escapeHtml(row.id)} / ${escapeHtml(row.function)}</div><p class="muted">${escapeHtml(row.category)} / ${escapeHtml(row.ikas?.subcategoryId||'')}</p><h3>${escapeHtml(row.subcategory)}</h3><p>${escapeHtml(row.ikas?.subcategory||'')}</p><span class="ikas-scope">${escapeHtml(row.ikas?.scope||'')} / ${escapeHtml(row.applicability)}</span></div><details class="ikas-rubric"><summary>Rubrik indeks 0-5</summary>${(row.ikas?.rubric||[]).map((text,index)=>`<h4>Indeks ${index}</h4><p style="white-space:pre-wrap">${escapeHtml(text)}</p>`).join('')}</details><div class="csf-form-grid ikas-assessment-fields">${ikasScores(row)}<label class="ikas-description-field"><span>Keterangan</span><textarea rows="6" data-ikas-note="${escapeHtml(row.id)}" placeholder="Tuliskan keterangan penilaian dan bukti pendukung..." ${canPerform('ikas-assessment','update')?'':'disabled'}>${escapeHtml(ikasState.notes[row.id]||'')}</textarea></label></div>${ikasEvidence(row)}${assessmentGapButton('ikas',row.id)}<div class="ikas-control-footer"><small>${escapeHtml(row.references||'')}</small>${canPerform('ikas','update')?`<button type="button" class="attachment-action-button" data-ikas-edit="${escapeHtml(row.id)}">Edit kontrol</button>`:''}</div></article>`;}

function renderIkasPagination(id,page,total,scope){const pages=Math.max(1,Math.ceil(total/20));page=Math.min(Math.max(1,page),pages);$(id).innerHTML=`<button type="button" data-ikas-page="${page-1}" data-scope="${scope}" ${page===1?'disabled':''}>Previous</button><span>Page ${page} of ${pages} · ${total} kontrol</span><button type="button" data-ikas-page="${page+1}" data-scope="${scope}" ${page===pages?'disabled':''}>Next</button>`;return page;}
function renderIkas(){
  const result=window.IkasScoring.summarize(ikasRows,ikasState);
  $('ikasOverallScore').textContent=ikasDisplay(result.overall);$('ikasOverallLevel').textContent=result.level;$('ikasCompletion').textContent=`${result.scored} / ${result.total} pertanyaan dinilai`;
  $('ikasDomainCards').innerHTML=result.domains.map((group,index)=>`<article class="function-card"><div class="card-top"><div><p class="eyebrow">DOMAIN ${['I','II','III','IV'][index]} / Bobot ${Math.round(group.weight*100)}%</p><h4>${escapeHtml(group.name)}</h4><p>${escapeHtml(group.level)}</p></div></div><div class="coverage-scores"><div class="coverage-score"><small>Indeks Nilai Kematangan</small><strong>${ikasDisplay(group.score)}</strong></div></div><div class="card-bar"><span style="width:${(group.score??0)/5*100}%"></span></div><button type="button" class="button button-quiet" data-ikas-domain="${escapeHtml(group.name)}">Mulai / lanjut assessment</button></article>`).join('');
  $('ikasSummaryBody').innerHTML=result.categories.map(group=>`<tr><td>${escapeHtml(group.domain)}</td><td>${escapeHtml(group.name)}</td><td><input type="number" min="0" max="5" step="0.1" data-ikas-target="${escapeHtml(group.name)}" value="${ikasState.targetScores[group.name]??3}" ${canPerform('ikas-assessment','update')?'':'disabled'}></td><td>${ikasDisplay(group.score)}</td><td>${group.score===null?'Belum lengkap':Math.max(0,(ikasState.targetScores[group.name]??3)-group.score).toFixed(2)}</td></tr>`).join('');
  $('ikasCompletionValue').textContent=Math.round(result.scored/Math.max(1,result.total)*100)+'%';$('ikasOverallMeter').style.width=((result.overall??0)/5*100)+'%';$('ikasPriorityGap').textContent=ikasRows.filter(row=>row.applicability!=='Not applicable'&&(ikasState.scores[row.id]===undefined||ikasState.scores[row.id]<ikasTarget(row))).length;renderIkasRadar(result);renderIkasList();renderGapSummaries();applyActionControls();
}
function renderIkasList(){
  const functionView=$('ikasAssessmentView').classList.contains('active-view');
  const query=$(functionView?'ikasAssessmentSearch':'ikasCoreSearch').value,status=$(functionView?'ikasAssessmentStatus':'ikasCoreStatus').value,domain=functionView?ikasDomain:$('ikasCoreDomain').value;
  const source=ikasRows.filter(row=>!domain||domain==='all'||row.function===domain),rows=ikasFiltered(source,query,status);
  ikasPage=renderIkasPagination(functionView?'ikasAssessmentPagination':'ikasCorePagination',ikasPage,rows.length,'assessment');
  const visible=rows.slice((ikasPage-1)*20,ikasPage*20);
  $('ikasControlList').innerHTML=functionView?visible.map(ikasControlCard).join(''):'';
  if(!functionView)$('ikasCoreList').innerHTML=`<div class="excel-wrap"><table class="excel-table ikas-core-table"><thead><tr><th>ID</th><th>Domain</th><th>Kategori / Subkategori</th><th>Pertanyaan</th><th>Ruang lingkup</th><th>Indeks Nilai Kematangan</th><th>Keterangan Validasi</th><th>Evidence / Gap</th><th>Aksi</th></tr></thead><tbody>${visible.map(row=>`<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.function)}</td><td>${escapeHtml(row.category)}<br>${escapeHtml(row.ikas.subcategoryId)}: ${escapeHtml(row.ikas.subcategory)}</td><td>${escapeHtml(row.subcategory)}<details><summary>Rubrik indeks 0–5</summary>${row.ikas.rubric.map((text,index)=>`<p><b>Indeks ${index}</b><br>${escapeHtml(text)}</p>`).join('')}</details></td><td>${escapeHtml(row.ikas.scope)}</td><td>${ikasScores(row).replace(/<small>[\s\S]*?<\/small>/,'')}</td><td><textarea rows="7" data-ikas-note="${escapeHtml(row.id)}" aria-label="Keterangan Validasi ${escapeHtml(row.id)}" ${canPerform('ikas-assessment','update')?'':'disabled'}>${escapeHtml(ikasState.notes[row.id]||'')}</textarea></td><td>${ikasEvidence(row)}${assessmentGapButton('ikas',row.id)}</td><td><button type="button" class="attachment-action-button" data-ikas-edit="${escapeHtml(row.id)}">Edit</button></td></tr>`).join('')||'<tr><td colspan="9">Tidak ada kontrol yang sesuai filter.</td></tr>'}</tbody></table></div>`;

  $('ikasCoreCount').textContent=`${rows.length} dari ${ikasRows.length} kontrol`;$('ikasFunctionProgress').textContent=`${source.filter(row=>ikasState.scores[row.id]!==undefined).length} / ${source.length} dinilai`;applyActionControls();
}
function renderIkasRadar(result){
  const canvas=$('ikasRadar'),layout=prepareRadarCanvas(canvas);if(!layout||result.domains.length!==4)return;
  const {context,width,height}=layout,cx=width/2,cy=height/2,r=Math.min(width/3,height/2-55);
  const point=(value,index)=>[cx+Math.cos(index*Math.PI/2-Math.PI/2)*r*value/5,cy+Math.sin(index*Math.PI/2-Math.PI/2)*r*value/5];
  context.strokeStyle='#94a3b8';for(let level=1;level<=5;level++){context.beginPath();for(let i=0;i<4;i++){const [x,y]=point(level,i);i?context.lineTo(x,y):context.moveTo(x,y);}context.closePath();context.stroke();}
  const series=(values,color)=>{context.beginPath();values.forEach((value,index)=>{const [x,y]=point(value??0,index);index?context.lineTo(x,y):context.moveTo(x,y);});context.closePath();context.strokeStyle=color;context.lineWidth=2;context.stroke();};
  series(result.domains.map(group=>group.categories.reduce((sum,row)=>sum+(ikasState.targetScores[row.name]??3),0)/group.categories.length),'#d3b55b');series(result.domains.map(row=>row.score),'#267256');
  context.fillStyle=document.documentElement.dataset.theme==='dark'?'#c4d3e8':'#334155';context.font='11px sans-serif';context.textAlign='center';result.domains.forEach((row,index)=>{const [x,y]=point(5.7,index);context.fillText(index===3?'PENANGGULANGAN / PEMULIHAN':row.name,x,y);});context.fillText('Target / Indeks Nilai Kematangan',cx,height-8);
}
function renderIkasManage(){
  const domain=$('ikasManageDomain').value,query=$('ikasManageSearch').value.toLowerCase();
  const rows=ikasFiltered(ikasRows.filter(row=>domain==='all'||row.function===domain),query,'all');ikasManagePage=renderIkasPagination('ikasManagePagination',ikasManagePage,rows.length,'manage');
  $('ikasManageBody').innerHTML=rows.slice((ikasManagePage-1)*20,ikasManagePage*20).map(row=>`<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.function)}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.ikas?.subcategoryId||'')}<br>${escapeHtml(row.ikas?.subcategory||'')}</td><td>${escapeHtml(row.subcategory)}</td><td>${escapeHtml(row.ikas?.scope||'')}</td><td>${escapeHtml(row.applicability)}</td><td><button type="button" class="attachment-action-button" data-ikas-edit="${escapeHtml(row.id)}" ${canPerform('ikas','update')?'':'disabled'}>Edit</button><button type="button" class="attachment-action-button danger" data-ikas-delete="${escapeHtml(row.id)}" ${canPerform('ikas','delete')?'':'disabled'}>Delete</button></td></tr>`).join('');applyActionControls();
}
function renderIkasRespondent(){
  if(!ikasTemplate)return;
  const choices={D6:['IT','OT','IT&OT'],D7:['administrasi pemerintahan','energi dan sumber daya mineral','transportasi','keuangan','kesehatan','teknologi informasi dan komunikasi','pangan','pertahanan','sektor lain'],D14:['Level 1','Level 2','Level 3','Level 4','Level 5']};
  $('ikasRespondentFields').innerHTML=ikasTemplate.respondentFields.map(field=>{
    const value=field.cell==='D13'?String(assessmentYears.ikas):ikasState.respondent[field.cell]||'',disabled=canPerform('ikas-assessment','update')?'':'disabled';
    const options=choices[field.cell];let control;
    if(options){const values=value&&!options.includes(value)?[value,...options]:options;control=`<select name="${field.cell}" ${disabled}><option value="">Pilih ${escapeHtml(field.label.toLowerCase())}</option>${values.map(option=>`<option value="${escapeHtml(option)}" ${value===option?'selected':''}>${escapeHtml(option)}</option>`).join('')}</select>`;}
    else control=`<input name="${field.cell}" type="${field.cell==='D9'?'email':field.cell==='D10'?'tel':field.cell==='D15'||field.cell==='D13'?'number':'text'}" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.label)}" ${field.cell==='D13'?'readonly':''} ${field.cell==='D15'?'min="0" max="5" step="0.01"':''} ${disabled}>`;
    return `<label class="ikas-respondent-field ${['D4','D5','D8'].includes(field.cell)?'ikas-field-wide':''}"><span>${escapeHtml(field.label)}</span>${control}${field.cell==='D13'?'<small>Mengikuti tahun assessment yang dipilih.</small>':''}</label>`;
  }).join('');
}

function showIkas(view='ikas',domain){
  const permission=view==='ikas-assessment'?'ikas-assessment':'ikas';if(!canPerform(permission,'read'))return;
  document.querySelectorAll('.view').forEach(node=>node.classList.remove('active-view'));$(view==='ikas-manage'?'ikasManageView':view==='ikas-assessment'?'ikasAssessmentView':'ikasView').classList.add('active-view');
  document.querySelectorAll('.nav-item').forEach(node=>node.classList.toggle('active',node.dataset.view===(view==='ikas-assessment'?'ikas':view)));saveUiState(view);
  if(domain)ikasDomain=domain;$('ikasAssessmentTitle').textContent=ikasDomain||'Assessment IKAS';localStorage.setItem('nist-ikas-domain',ikasDomain);ikasPage=1;
  void loadIkas().then(()=>{renderIkasList();}).catch(error=>ikasStatus(error.message));
}
function openIkasControl(id){
  const row=ikasRows.find(row=>row.id===id);if(!canPerform('ikas',row?'update':'create'))return;
  const form=$('ikasControlForm');form.reset();form.elements.originalId.value=id||'';form.elements.id.readOnly=!!row;
  for(const key of ['id','function','category','subcategory','references','minimumEvidence','notes','applicability'])if(row)form.elements[key].value=row[key]||'';
  form.elements.subcategoryId.value=row?.ikas?.subcategoryId||'';form.elements.subcategoryTitle.value=row?.ikas?.subcategory||'';form.elements.scope.value=row?.ikas?.scope||'';
  $('ikasRubricFields').innerHTML=Array.from({length:6},(_,index)=>`<label>Indeks ${index}<textarea name="rubric${index}" rows="4" required>${escapeHtml(row?.ikas?.rubric[index]||'')}</textarea></label>`).join('');form.querySelector('[role=status]').textContent='';$('ikasControlModal').showModal();
}
async function selectIkasEvidence(key){
  await refreshEvidenceLibrary({force:true});const dialog=document.createElement('dialog');dialog.className='assessment-year-dialog';
  dialog.innerHTML='<h2>Select uploaded evidence</h2><input type="search" placeholder="Cari file..." aria-label="Cari file evidence"><div data-files></div><p role="status"></p><button type="button" class="button button-quiet" data-close>Batal</button>';
  let page=1;const render=()=>{const rows=selectableEvidenceRecords().filter(row=>evidenceMatches(row,normalizeFileSearch(dialog.querySelector('input').value))),pages=Math.max(1,Math.ceil(rows.length/20));page=Math.min(page,pages);dialog.querySelector('[data-files]').innerHTML=rows.slice((page-1)*20,page*20).map((file,index)=>`<button type="button" class="existing-file-option" data-file-index="${index+(page-1)*20}">${escapeHtml(file.name)}<small>${escapeHtml(file.path)}</small></button>`).join('')+`<button type="button" data-file-page="${page-1}" ${page===1?'disabled':''}>Previous</button> ${page} / ${pages} <button type="button" data-file-page="${page+1}" ${page===pages?'disabled':''}>Next</button>`;dialog._files=rows;};
  dialog.querySelector('input').oninput=()=>{page=1;render();};dialog.querySelector('[data-close]').onclick=()=>dialog.close();
  dialog.onclick=async event=>{const pagination=event.target.closest('[data-file-page]');if(pagination){page=Number(pagination.dataset.filePage);render();return;}const button=event.target.closest('[data-file-index]');if(!button)return;button.disabled=true;const file=evidenceReference(dialog._files[Number(button.dataset.fileIndex)]);if(!(ikasState.attachments[key]||[]).some(row=>row.path===file.path))(ikasState.attachments[key]??=[]).push(file);try{await saveIkas();dialog.close();renderIkasList();}catch(error){dialog.querySelector('[role=status]').textContent=error.message;button.disabled=false;}};
  dialog.onclose=()=>dialog.remove();document.body.append(dialog);render();dialog.showModal();
}
async function uploadIkasEvidence(input,replace=false){
  if(!canPerform('ikas-assessment','update')||!input.files.length)return;
  const key=replace?input.dataset.ikasReplace:input.dataset.ikasUpload,kind=key.startsWith('policy-')?'policy':'practice';
  input.disabled=true;const progress=document.createElement('p');progress.className='upload-progress is-indeterminate';progress.setAttribute('role','status');progress.textContent='Uploading evidence...';input.parentElement.append(progress);
  try{
    for(const file of input.files){const body=new FormData();body.append('file',file);body.append('functionName','IKAS BSSN');body.append('kind',kind);const saved=await ikasRequest('/api/files','POST',body);const files=ikasState.attachments[key]??=[];if(replace)files[Number(input.dataset.index)]=saved;else files.push(saved);}
    await saveIkas();await refreshEvidenceLibrary({force:true});renderIkasList();
  }catch(error){ikasStatus(error.message);}finally{progress.remove();input.disabled=false;input.value='';}
}
document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-view]');if(nav&&['ikas','ikas-manage','ikas-assessment'].includes(nav.dataset.view))showIkas(nav.dataset.view);
  const domain=event.target.closest('[data-ikas-domain]');if(domain)showIkas('ikas-assessment',domain.dataset.ikasDomain);
  const tab=event.target.closest('[data-ikas-tab]');if(tab){ikasTab=tab.dataset.ikasTab;document.querySelectorAll('[data-ikas-panel]').forEach(node=>node.hidden=node.dataset.ikasPanel!==ikasTab);document.querySelectorAll('[data-ikas-tab]').forEach(node=>{node.classList.toggle('button-accent',node===tab);node.classList.toggle('button-quiet',node!==tab);});if(ikasTab==='gaps')void loadAssessmentGaps('ikas');renderIkas();}

  const edit=event.target.closest('[data-ikas-edit]');if(edit)openIkasControl(edit.dataset.ikasEdit);
  const remove=event.target.closest('[data-ikas-delete]');if(remove&&canPerform('ikas','delete')&&confirm('Hapus kontrol IKAS pada tahun terpilih? Gap kontrol ini juga akan dihapus.'))void ikasRequest('/api/ikas/'+encodeURIComponent(remove.dataset.ikasDelete),'DELETE').then(loadIkas).catch(error=>ikasStatus(error.message));
  const page=event.target.closest('[data-ikas-page]');if(page){if(page.dataset.scope==='manage'){ikasManagePage=Number(page.dataset.ikasPage);renderIkasManage();}else{ikasPage=Number(page.dataset.ikasPage);renderIkasList();}}
  const select=event.target.closest('[data-ikas-select-file]');if(select&&canPerform('ikas-assessment','update'))void selectIkasEvidence(select.dataset.ikasSelectFile).catch(error=>ikasStatus(error.message));
  const detach=event.target.closest('[data-ikas-detach]');if(detach&&canPerform('ikas-assessment','update')){ikasState.attachments[detach.dataset.ikasDetach].splice(Number(detach.dataset.index),1);void saveIkas().then(renderIkasList).catch(()=>{});}
  if(event.target.closest('[data-ikas-excel]'))void (async()=>{await ikasSaveQueue;const response=await fetch('/api/ikas-workbook');if(!response.ok)throw Error('Export Excel gagal.');const url=(window.NistFileLimits?.exportUrl.bind(window.NistFileLimits) || URL.createObjectURL)(await response.blob()),link=document.createElement('a');link.href=url;link.download=`IKAS-BSSN-v1.2.1-${assessmentYears.ikas}.xlsx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);})().catch(error=>ikasStatus(error.message));
  if(event.target.closest('[data-ikas-import-excel]')&&canPerform('ikas-assessment','update'))$('ikasExcelImport').click();
  if(event.target.closest('[data-ikas-reset]')&&canPerform('ikas-assessment','delete')&&confirm('Reset assessment IKAS tahun '+assessmentYears.ikas+'? Skor, catatan, dan referensi evidence akan dikosongkan.'))void (async()=>{await ikasSaveQueue;await ikasRequest('/api/ikas/assessment/reset','POST');await loadIkas();})().catch(error=>ikasStatus(error.message));
});
document.addEventListener('input',event=>{if(event.target.matches('[data-ikas-note]')&&canPerform('ikas-assessment','update')){ikasState.notes[event.target.dataset.ikasNote]=event.target.value;void saveIkas().catch(()=>{});}});
document.addEventListener('change',event=>{
  const input=event.target;if(input.matches('[data-ikas-index]')&&canPerform('ikas-assessment','update')){if(input.value==='')delete ikasState.scores[input.dataset.ikasIndex];else ikasState.scores[input.dataset.ikasIndex]=Number(input.value);void saveIkas().catch(()=>{});renderIkas();}if(input.matches('[data-ikas-upload]'))void uploadIkasEvidence(input);if(input.matches('[data-ikas-replace]'))void uploadIkasEvidence(input,true);
  if(input.matches('[data-ikas-target]')&&canPerform('ikas-assessment','update')){const value=Number(input.value);if(!Number.isFinite(value)||value<0||value>5)return;ikasState.targetScores[input.dataset.ikasTarget]=value;void ikasRequest('/api/frameworks/ikas/targets/'+encodeURIComponent(input.dataset.ikasTarget),'PUT',{targetScore:value}).then(saveIkas).then(renderIkas).catch(error=>ikasStatus(error.message));}
});
for(const id of ['ikasCoreSearch','ikasCoreDomain','ikasCoreStatus','ikasAssessmentSearch','ikasAssessmentStatus'])$(id).addEventListener(id.includes('Search')?'input':'change',()=>{ikasPage=1;renderIkasList();});
for(const id of ['ikasManageSearch','ikasManageDomain'])$(id).addEventListener(id.includes('Search')?'input':'change',()=>{ikasManagePage=1;renderIkasManage();});
$('ikasNewButton').onclick=()=>openIkasControl();
document.querySelector('[data-ikas-modal-cancel]').onclick=()=>$('ikasControlModal').close();
$('ikasControlForm').addEventListener('submit',guardFormSubmission(async event=>{
  event.preventDefault();const form=event.currentTarget,id=form.elements.originalId.value;if(!canPerform('ikas',id?'update':'create'))return;
  const previous=ikasRows.find(row=>row.id===id),body=Object.fromEntries(['id','function','category','subcategory','references','minimumEvidence','notes','applicability'].map(key=>[key,form.elements[key].value]));
  body.ikas={...previous?.ikas,subcategoryId:form.elements.subcategoryId.value,subcategory:form.elements.subcategoryTitle.value,scope:form.elements.scope.value,rubric:Array.from({length:6},(_,index)=>form.elements['rubric'+index].value),weight:ikasTemplate.domains.find(row=>row.name===body.function).weight};body.implementation=body.ikas.rubric.map((text,index)=>`Indeks ${index}:\n${text}`).join('\n\n');
  try{await ikasRequest('/api/ikas'+(id?'/'+encodeURIComponent(id):''),id?'PUT':'POST',body);$('ikasControlModal').close();await loadIkas();}catch(error){form.querySelector('[role=status]').textContent=error.message;}
}));
$('ikasRespondentForm').addEventListener('submit',guardFormSubmission(async event=>{event.preventDefault();if(!canPerform('ikas-assessment','update'))return;ikasState.respondent=Object.fromEntries(new FormData(event.currentTarget));ikasState.respondent.D13=String(assessmentYears.ikas);await saveIkas();}));
let ikasImportFile=null;
$('ikasExcelImport').onchange=async event=>{
  const input=event.target,file=input.files[0];if(!file)return;input.disabled=true;
  try{
    await ikasSaveQueue;const body=new FormData();body.append('file',file);
    const preview=await ikasRequest('/api/ikas-workbook/preview','POST',body);ikasImportFile=file;
    $('ikasExcelImportDomains').innerHTML=preview.domains.map(domain=>`<label class="permission-option"><input type="checkbox" name="domain" value="${escapeHtml(domain.name)}" checked><span><strong>${escapeHtml(domain.name)}</strong><small>${domain.questions} pertanyaan · ${domain.added} baru · ${domain.removed} dihapus</small></span></label>`).join('');
    $('ikasExcelImportStatus').textContent='Tujuan: assessment '+preview.year+'. Pilih semua domain atau hanya domain yang berubah.';
    $('ikasExcelImportDialog').showModal();
  }catch(error){ikasStatus(error.message);}finally{input.disabled=false;input.value='';}
};
$('ikasExcelImportCancel').onclick=()=>$('ikasExcelImportDialog').close();
$('ikasExcelImportForm').addEventListener('submit',guardFormSubmission(async event=>{
  event.preventDefault();const domains=[...event.currentTarget.querySelectorAll('[name=domain]:checked')].map(input=>input.value);
  if(!domains.length){$('ikasExcelImportStatus').textContent='Pilih minimal satu domain.';return;}
  const body=new FormData();body.append('file',ikasImportFile);body.append('domains',JSON.stringify(domains));
  try{await ikasSaveQueue;const result=await ikasRequest('/api/ikas-workbook','POST',body);$('ikasExcelImportDialog').close();await loadIkas();ikasStatus('Import berhasil: '+result.questions+' pertanyaan pada '+result.domains.length+' domain.');}catch(error){$('ikasExcelImportStatus').textContent=error.message;}
}));
window.addEventListener('evidence-file-deleted',event=>{const path=String(event.detail.path).replace(/^uploads?\//,'');for(const key of Object.keys(ikasState.attachments))ikasState.attachments[key]=ikasState.attachments[key].filter(file=>String(file.path).replace(/^uploads?\//,'')!==path);renderIkasList();});
workspaceUserReady.then(user=>{
  if(!user)return;currentUserRole=user.role;currentUserActions=user.actions||{};currentUserPermissions=user.permissions||[];
  for(const nav of document.querySelectorAll('[data-view="ikas"],[data-view="ikas-manage"]')){nav.hidden=!canPerform('ikas','read');nav.disabled=nav.hidden;}
  if(['ikas','ikas-manage','ikas-assessment'].includes(ikasInitialView)){ikasDomain=localStorage.getItem('nist-ikas-domain')||'';showIkas(ikasInitialView);}
}).catch(error=>ikasStatus(error.message));
