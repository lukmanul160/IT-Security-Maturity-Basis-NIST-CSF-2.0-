// One persistent recipient register shared by every reminder module.

window.NistReminderRecipients={
 registered:[],

 _pending:null,
 _loaded:false,
 async records(force=false){
  if(this._pending)return this._pending;
  if(this._loaded&&!force)return this.registered;
  this._pending=(async()=>{const response=await fetch('/api/reminder-recipients',{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Register penerima gagal dimuat.');this.registered=data;this._loaded=true;window.dispatchEvent(new Event('reminder-recipients-loaded'));return data;})();
  try{return await this._pending;}finally{this._pending=null;}
 },
 _watchers:new Set(),
 watchVisible(callback){
  this._watchers.add(callback);
  if(!this._observer){
   let queued=false;
   this._observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;for(const check of this._watchers)check();});});
   this._observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden','open','style']});
  }
  callback();return ()=>this._watchers.delete(callback);
 },

 mount(host,onSelect,{canRegister=false,ownerOptions}={}){

  host.innerHTML='<details data-recipient-dropdown><summary>Daftar penerima</summary><label>Cari penerima terdaftar<input type="search" placeholder="Contoh: SOC Manager" autocomplete="off"></label><label>Pilih penerima<select><option value="">Pilih nama / jabatan...</option></select></label><div class="list-pagination"><button type="button" data-prev>Previous</button><span role="status"></span><button type="button" data-next>Next</button></div><button type="button" class="button button-quiet" data-reload>Muat ulang register</button>'+(canRegister?'<div data-register-list></div><button type="button" class="button button-quiet" data-add>Tambah penerima</button><details data-recipient-editor><summary>Tambah / edit penerima</summary><label>Nama / jabatan<input data-owner maxlength="160" placeholder="SOC Manager"></label><label>Email<input data-email type="email" maxlength="254" placeholder="nama@example.com"></label><button type="button" class="button button-quiet" data-save>Simpan penerima</button><button type="button" class="button button-quiet" data-cancel>Batal</button><p class="muted">Gunakan Edit untuk memperbarui nama atau email penerima. Pengaturan reminder diterapkan setelah disimpan pada modul.</p></details>':'')+'<p data-message role="status"></p></details>';

  let records=[],page=1,editingOwner=null;const input=host.querySelector('[type=search]'),select=host.querySelector('select'),message=host.querySelector('[data-message]');

  const render=()=>{const query=input.value.trim().toLowerCase(),matches=records.filter(row=>(row.owner+' '+row.email).toLowerCase().includes(query)),pages=Math.max(1,Math.ceil(matches.length/8));page=Math.max(1,Math.min(page,pages));select.innerHTML='<option value="">Pilih nama / jabatan...</option>'+matches.slice((page-1)*8,page*8).map(row=>`<option value="${escapeHtml(row.owner)}">${escapeHtml(row.owner)} &#8212; ${escapeHtml(row.email||'Email belum diisi')}</option>`).join('');host.querySelector('[role=status]').textContent=`${page} / ${pages} \u00b7 ${matches.length} penerima`;host.querySelector('[data-prev]').disabled=page===1;host.querySelector('[data-next]').disabled=page===pages;
    if(canRegister){const list=host.querySelector('[data-register-list]');list.replaceChildren();for(const row of matches.slice((page-1)*8,page*8)){const item=document.createElement('div');item.className='recipient-register-row';const info=document.createElement('span');info.textContent=row.owner+' \u2014 '+(row.email||'Email belum diisi');const edit=document.createElement('button');edit.type='button';edit.className='button button-quiet';edit.textContent='Edit';edit.setAttribute('aria-label','Edit '+row.owner);edit.onclick=()=>{editingOwner=row.owner;host.querySelector('[data-owner]').value=row.owner;host.querySelector('[data-email]').value=row.email;host.querySelector('[data-recipient-editor]').open=true;host.querySelector('[data-owner]').focus();};const del=document.createElement('button');del.type='button';del.className='button button-quiet';del.textContent='Hapus';del.setAttribute('aria-label','Hapus '+row.owner);del.onclick=async()=>{if(!confirm('Hapus penerima '+row.owner+' dari register email?'))return;del.disabled=true;try{const response=await fetch('/api/reminder-recipients/'+encodeURIComponent(row.owner),{method:'DELETE'});if(!response.ok){const result=await response.json();throw Error(result.error||'Penerima gagal dihapus.');}if(editingOwner===row.owner)resetEditor();await load(true);message.textContent='Penerima dihapus dari register. Periksa dan simpan pengaturan reminder pada modul bila perlu.';window.dispatchEvent(new CustomEvent('reminder-recipient-register-updated',{detail:host}));}catch(error){message.textContent=error.message;}finally{del.disabled=false;}};item.append(info,edit,del);list.append(item);}}
  };

  let loaded=false,pending=null;
  const load=async(force=false)=>{if(pending)return pending;pending=(async()=>{try{records=await window.NistReminderRecipients.records(force);loaded=true;render();if(canRegister){let names=ownerOptions?ownerOptions():records.map(row=>row.owner);const owner=host.querySelector('[data-owner]');let suggestions=host.querySelector('datalist');if(!suggestions){suggestions=document.createElement('datalist');suggestions.id='recipient-owner-'+Math.random().toString(36).slice(2);owner.setAttribute('list',suggestions.id);owner.after(suggestions);}suggestions.innerHTML=[...new Set(names)].map(name=>`<option value="${escapeHtml(name)}"></option>`).join('');}message.textContent='';}catch(error){message.textContent=error.message;}})();try{await pending;}finally{pending=null;}};

  const resetEditor=()=>{editingOwner=null;host.querySelector('[data-owner]').value='';host.querySelector('[data-email]').value='';host.querySelector('[data-recipient-editor]').open=false;};
  if(canRegister){host.querySelector('[data-add]').onclick=()=>{resetEditor();host.querySelector('[data-recipient-editor]').open=true;host.querySelector('[data-owner]').focus();};host.querySelector('[data-cancel]').onclick=resetEditor;}
  input.oninput=()=>{page=1;render();};select.onchange=()=>{const row=records.find(row=>row.owner===select.value);if(row){onSelect(row);if(canRegister){editingOwner=row.owner;host.querySelector('[data-owner]').value=row.owner;host.querySelector('[data-email]').value=row.email;}}select.value='';};

  host.querySelector('[data-prev]').onclick=()=>{page--;render();};host.querySelector('[data-next]').onclick=()=>{page++;render();};host.querySelector('[data-reload]').onclick=()=>load(true);

  if(canRegister)host.querySelector('[data-save]').onclick=async event=>{const button=event.currentTarget,email=host.querySelector('[data-email]'),owner=host.querySelector('[data-owner]');if(!owner.value.trim()||(email.value&&!email.reportValidity())){message.textContent='Isi nama/jabatan. Email boleh kosong atau gunakan alamat yang valid.';return;}button.disabled=true;try{const response=await fetch('/api/reminder-recipients'+(editingOwner===null?'':'/'+encodeURIComponent(editingOwner)),{method:editingOwner===null?'POST':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:owner.value,email:email.value})});const row=await response.json();if(!response.ok)throw Error(row.error||'Penerima gagal disimpan.');await load(true);onSelect(row);resetEditor();message.textContent='Owner/PIC tersimpan di register SMTP.';window.dispatchEvent(new CustomEvent('reminder-recipient-register-updated',{detail:host}));}catch(error){message.textContent=error.message;}finally{button.disabled=false;}};

  const visible=()=>host.isConnected&&host.getClientRects().length>0;
  const ensure=()=>loaded?Promise.resolve():load();
  let autoAttempted=false;
  const unwatch=window.NistReminderRecipients.watchVisible(()=>{if(!loaded&&!pending&&!autoAttempted&&visible()){autoAttempted=true;void ensure();}});
  const updated=event=>{if(event.detail===host)return;loaded=false;if(visible())void load();};
  window.addEventListener('reminder-recipient-register-updated',updated);
  return {reload:()=>load(true),get ready(){return ensure();},openOwner:async name=>{host.querySelector('[data-recipient-dropdown]').open=true;await ensure();input.value=name;render();if(canRegister){const row=records.find(row=>row.owner.toLowerCase()===name.toLowerCase());editingOwner=row?.owner||null;host.querySelector('[data-owner]').value=row?.owner||name;host.querySelector('[data-email]').value=row?.email||'';host.querySelector('[data-recipient-editor]').open=true;}},destroy:()=>{unwatch();window.removeEventListener('reminder-recipient-register-updated',updated);}};

 },

 mapping(id){
  const field=document.getElementById(id);if(!field)return;
  field.readOnly=true;field.hidden=true;
  const host=document.createElement('section');host.className='insight-panel smtp-wide';field.before(host);
  const list=document.createElement('section');list.className='recipient-mapping smtp-wide';list.dataset.mappingFor=id;
  list.innerHTML='<label>Cari pemetaan<input type="search" placeholder="Nama PIC atau email"></label><div data-mapping-list></div><div class="list-pagination"><button type="button" data-mapping-prev>Sebelumnya</button><span role="status"></span><button type="button" data-mapping-next>Berikutnya</button></div>';
  field.after(list);let page=1;const search=list.querySelector('input');
  const lines=()=>field.value.split('\n').filter(line=>line.trim());
  function render(){
    const all=lines(),query=search.value.trim().toLowerCase();
    const matches=all.map((line,index)=>({line,index})).filter(row=>row.line.toLowerCase().includes(query));
    const pages=Math.max(1,Math.ceil(matches.length/8));page=Math.min(Math.max(1,page),pages);
    list.querySelector('[data-mapping-list]').innerHTML=matches.slice((page-1)*8,page*8).map(row=>`<div class="recipient-register-row"><span>${escapeHtml(row.line)}</span><button type="button" class="button button-quiet" data-mapping-index="${row.index}" ${field.disabled?'disabled':''}>Hapus pemetaan</button></div>`).join('')||'<p class="muted">Belum ada pemetaan yang sesuai.</p>';
    list.querySelector('[role=status]').textContent=`${page} / ${pages} - ${matches.length} pemetaan`;
    list.querySelector('[data-mapping-prev]').disabled=field.disabled||page===1;
    list.querySelector('[data-mapping-next]').disabled=field.disabled||page===pages;
  }
  this.mount(host,row=>{if(!row.email)return;const all=lines(),index=all.findIndex(line=>line.slice(0,line.lastIndexOf('=')).trim().toLowerCase()===row.owner.toLowerCase()),value=row.owner+' = '+row.email;if(index<0)all.push(value);else all[index]=value;field.value=all.join('\n');render();},{canRegister:true,ownerOptions:id==='policySmtpOwners'?()=>getPolicyDropdownOptions('owners'):()=>[...new Set([...document.querySelectorAll('#afOwner option')].map(option=>option.value).filter(Boolean).concat(this.registered.map(row=>row.owner)))]});
  search.addEventListener('input',()=>{page=1;render();});
  list.querySelector('[data-mapping-prev]').onclick=()=>{page--;render();};
  list.querySelector('[data-mapping-next]').onclick=()=>{page++;render();};
  list.addEventListener('click',event=>{const button=event.target.closest('[data-mapping-index]');if(!button||field.disabled)return;const all=lines();all.splice(Number(button.dataset.mappingIndex),1);field.value=all.join('\n');render();});
  new MutationObserver(render).observe(field,{attributes:true,attributeFilter:['disabled']});
  field.addEventListener('recipients-populated',()=>{page=1;render();});render();
 }


};

window.NistReminderRecipients.mapping('policySmtpOwners');

window.NistReminderRecipients.mapping('aftReminderOwners');
window.NistReminderRecipients.mapping('crReminderOwners');

const auditEmail=document.querySelector('#aftForm [name=ownerEmail]');

if(auditEmail){auditEmail.readOnly=true;const host=document.createElement('div');auditEmail.before(host);window.NistReminderRecipients.mount(host,row=>{auditEmail.value=row.email;document.querySelector('#aftForm [name=owner]').value=row.owner;});}


window.addEventListener('reminder-recipients-loaded',()=>{
 if(typeof updatePolicySelectOptions==='function')updatePolicySelectOptions('owners','policyRegisterOwner','Select owner');
 document.querySelectorAll('[data-smtp-linked]').forEach(field=>field.dispatchEvent(new Event('change')));
});

function attachOwnerSmtpLinks(){
 for(const field of document.querySelectorAll('#policyRegisterOwner,#aftForm [name=owner],[data-smtp-owner]')){
  if(field.dataset.smtpLinked){if(field._smtpOwnerValue!==field.value)field._smtpRefresh?.();continue;}field.dataset.smtpLinked='true';
  const link=document.createElement('button');link.type='button';link.className='owner-smtp-link';field.after(link);
  const emailField=()=>field.closest('form')?.querySelector('[name=ownerEmail],[data-smtp-owner-email]');
  const refresh=()=>{field._smtpOwnerValue=field.value;const name=field.value.trim(),row=window.NistReminderRecipients.registered.find(row=>row.owner.toLowerCase()===name.toLowerCase());const text=row?'SMTP: '+(row.email||'Email belum diisi')+' - Edit':'Register SMTP / isi email Owner';if(link.textContent!==text)link.textContent=text;link.disabled=!name;const email=emailField();if(email&&row&&email.value!==row.email){email.value=row.email;email.dispatchEvent(new Event('input',{bubbles:true}));}};
  field._smtpRefresh=refresh;field.addEventListener('change',refresh);field.addEventListener('input',refresh);refresh();
  link.onclick=async()=>{const dialog=document.createElement('dialog');dialog.className='owner-smtp-dialog';const heading=document.createElement('h3');heading.textContent='Register SMTP - '+field.value;const close=document.createElement('button');close.type='button';close.className='button button-quiet';close.textContent='Kembali ke form';const host=document.createElement('section');dialog.append(heading,close,host);document.body.append(dialog);dialog.showModal();let picker;dialog.addEventListener('close',()=>{picker?.destroy();dialog.remove();field.focus();},{once:true});close.onclick=()=>dialog.close();
   try{const response=await fetch('/api/auth/me'),user=await response.json();if(!response.ok)throw Error('Sesi berakhir.');picker=window.NistReminderRecipients.mount(host,row=>{if(field.tagName==='SELECT'&&![...field.options].some(option=>option.value===row.owner)){const option=document.createElement('option');option.value=row.owner;option.textContent=row.owner;field.append(option);}field.value=row.owner;field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));const email=emailField();if(email){email.value=row.email;email.dispatchEvent(new Event('input',{bubbles:true}));}refresh();},{canRegister:user.role==='admin'});await picker.openOwner(field.value);}catch(error){host.textContent=error.message;}
  };
 }
}
attachOwnerSmtpLinks();new MutationObserver(attachOwnerSmtpLinks).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open','hidden']});

for(const id of ['globalSmtpTestTo','policySmtpTestTo','aftReminderTestTo']){
 const field=document.getElementById(id);if(!field)continue;const host=document.createElement('section');host.className='insight-panel smtp-wide';field.parentElement.before(host);window.NistReminderRecipients.mount(host,row=>{field.value=row.email;field.dispatchEvent(new Event('input'));},{canRegister:id==='globalSmtpTestTo'});
}
const broadcast=document.getElementById('aftReminderRecipients');
if(broadcast){const host=document.createElement('section');host.className='insight-panel';broadcast.before(host);window.NistReminderRecipients.mount(host,row=>{const emails=broadcast.value.split('\n').map(value=>value.trim()).filter(Boolean);if(!emails.includes(row.email))emails.push(row.email);broadcast.value=emails.join('\n');});}
