// One persistent recipient register shared by every reminder module.

window.NistReminderRecipients={
 registered:[],

 async records(){const response=await fetch('/api/reminder-recipients',{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Register penerima gagal dimuat.');this.registered=data;window.dispatchEvent(new Event('reminder-recipients-loaded'));return data;},

 mount(host,onSelect,{canRegister=false,ownerOptions}={}){

  host.innerHTML='<label>Cari penerima terdaftar<input type="search" placeholder="Contoh: SOC Manager" autocomplete="off"></label><label>Pilih penerima<select><option value="">Pilih nama / jabatan...</option></select></label><div class="list-pagination"><button type="button" data-prev>Previous</button><span role="status"></span><button type="button" data-next>Next</button></div><button type="button" class="button button-quiet" data-reload>Muat ulang register</button>'+(canRegister?'<div data-register-list></div><button type="button" class="button button-quiet" data-add>Tambah penerima</button><details><summary>Tambah / edit penerima</summary><label>Nama / jabatan<input data-owner maxlength="160" placeholder="SOC Manager"></label><label>Email<input data-email type="email" maxlength="254" placeholder="nama@example.com"></label><button type="button" class="button button-quiet" data-save>Simpan penerima</button><button type="button" class="button button-quiet" data-cancel>Batal</button><p class="muted">Gunakan Edit untuk memperbarui nama atau email penerima. Pengaturan reminder diterapkan setelah disimpan pada modul.</p></details>':'')+'<p data-message role="status"></p>';

  let records=[],page=1,editingOwner=null;const input=host.querySelector('[type=search]'),select=host.querySelector('select'),message=host.querySelector('[data-message]');

  const render=()=>{const query=input.value.trim().toLowerCase(),matches=records.filter(row=>(row.owner+' '+row.email).toLowerCase().includes(query)),pages=Math.max(1,Math.ceil(matches.length/8));page=Math.max(1,Math.min(page,pages));select.innerHTML='<option value="">Pilih nama / jabatan...</option>'+matches.slice((page-1)*8,page*8).map(row=>`<option value="${escapeHtml(row.owner)}">${escapeHtml(row.owner)} ? ${escapeHtml(row.email)}</option>`).join('');host.querySelector('[role=status]').textContent=`${page} / ${pages} ? ${matches.length} penerima`;host.querySelector('[data-prev]').disabled=page===1;host.querySelector('[data-next]').disabled=page===pages;
    if(canRegister){const list=host.querySelector('[data-register-list]');list.replaceChildren();for(const row of matches.slice((page-1)*8,page*8)){const item=document.createElement('div');item.className='recipient-register-row';const info=document.createElement('span');info.textContent=row.owner+' ? '+row.email;const edit=document.createElement('button');edit.type='button';edit.className='button button-quiet';edit.textContent='Edit';edit.setAttribute('aria-label','Edit '+row.owner);edit.onclick=()=>{editingOwner=row.owner;host.querySelector('[data-owner]').value=row.owner;host.querySelector('[data-email]').value=row.email;host.querySelector('details').open=true;host.querySelector('[data-owner]').focus();};const del=document.createElement('button');del.type='button';del.className='button button-quiet';del.textContent='Hapus';del.setAttribute('aria-label','Hapus '+row.owner);del.onclick=async()=>{if(!confirm('Hapus penerima '+row.owner+' dari register email?'))return;del.disabled=true;try{const response=await fetch('/api/reminder-recipients/'+encodeURIComponent(row.owner),{method:'DELETE'});if(!response.ok){const result=await response.json();throw Error(result.error||'Penerima gagal dihapus.');}if(editingOwner===row.owner)resetEditor();await load();message.textContent='Penerima dihapus dari register. Periksa dan simpan pengaturan reminder pada modul bila perlu.';window.dispatchEvent(new CustomEvent('reminder-recipient-register-updated',{detail:host}));}catch(error){message.textContent=error.message;}finally{del.disabled=false;}};item.append(info,edit,del);list.append(item);}}
  };

  const load=async()=>{try{records=await window.NistReminderRecipients.records();render();if(canRegister){let names=ownerOptions?ownerOptions():records.map(row=>row.owner);const owner=host.querySelector('[data-owner]');let suggestions=host.querySelector('datalist');if(!suggestions){suggestions=document.createElement('datalist');suggestions.id='recipient-owner-'+Math.random().toString(36).slice(2);owner.setAttribute('list',suggestions.id);owner.after(suggestions);}suggestions.innerHTML=[...new Set(names)].map(name=>`<option value="${escapeHtml(name)}"></option>`).join('');}message.textContent='';}catch(error){message.textContent=error.message;}};

  const resetEditor=()=>{editingOwner=null;host.querySelector('[data-owner]').value='';host.querySelector('[data-email]').value='';host.querySelector('details').open=false;};
  if(canRegister){host.querySelector('[data-add]').onclick=()=>{resetEditor();host.querySelector('details').open=true;host.querySelector('[data-owner]').focus();};host.querySelector('[data-cancel]').onclick=resetEditor;}
  input.oninput=()=>{page=1;render();};select.onchange=()=>{const row=records.find(row=>row.owner===select.value);if(row){onSelect(row);if(canRegister){editingOwner=row.owner;host.querySelector('[data-owner]').value=row.owner;host.querySelector('[data-email]').value=row.email;}}select.value='';};

  host.querySelector('[data-prev]').onclick=()=>{page--;render();};host.querySelector('[data-next]').onclick=()=>{page++;render();};host.querySelector('[data-reload]').onclick=load;

  if(canRegister)host.querySelector('[data-save]').onclick=async event=>{const button=event.currentTarget,email=host.querySelector('[data-email]'),owner=host.querySelector('[data-owner]');if(!owner.value.trim()||!email.value||!email.reportValidity()){message.textContent='Isi nama/jabatan dan email yang valid.';return;}button.disabled=true;try{const response=await fetch('/api/reminder-recipients'+(editingOwner===null?'':'/'+encodeURIComponent(editingOwner)),{method:editingOwner===null?'POST':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:owner.value,email:email.value})});const row=await response.json();if(!response.ok)throw Error(row.error||'Penerima gagal disimpan.');await load();onSelect(row);resetEditor();message.textContent='Penerima tersimpan. Simpan pengaturan reminder untuk menerapkan pilihan.';window.dispatchEvent(new CustomEvent('reminder-recipient-register-updated',{detail:host}));}catch(error){message.textContent=error.message;}finally{button.disabled=false;}};

  const updated=event=>{if(host.isConnected&&event.detail!==host)void load();};window.addEventListener('reminder-recipient-register-updated',updated);void load();return {reload:load,destroy:()=>window.removeEventListener('reminder-recipient-register-updated',updated)};

 },

 mapping(id){const field=document.getElementById(id);if(!field)return;field.readOnly=true;const host=document.createElement('section');host.className='insight-panel smtp-wide';field.before(host);this.mount(host,row=>{const lines=field.value.split('\n').filter(line=>line.trim()),index=lines.findIndex(line=>line.slice(0,line.lastIndexOf('=')).trim()===row.owner),value=row.owner+' = '+row.email;if(index<0)lines.push(value);else lines[index]=value;field.value=lines.join('\n');render();},{canRegister:true,ownerOptions:id==='policySmtpOwners'?()=>getPolicyDropdownOptions('owners'):()=>[...new Set([...document.querySelectorAll('#afOwner option')].map(option=>option.value).filter(Boolean).concat(this.registered.map(row=>row.owner)))]});const actions=document.createElement('div');field.after(actions);function render(){actions.innerHTML=field.value.split('\n').filter(line=>line.trim()).map((line,index)=>`<button type="button" class="button button-quiet" data-index="${index}">Hapus ${escapeHtml(line.slice(0,line.lastIndexOf('=')))}</button>`).join('');}actions.onclick=event=>{const button=event.target.closest('[data-index]');if(button){const lines=field.value.split('\n').filter(line=>line.trim());lines.splice(Number(button.dataset.index),1);field.value=lines.join('\n');render();}};new MutationObserver(render).observe(field,{attributes:true});field.addEventListener('recipients-populated',render);render();

 }

};

window.NistReminderRecipients.mapping('policySmtpOwners');

window.NistReminderRecipients.mapping('aftReminderOwners');

const auditEmail=document.querySelector('#aftForm [name=ownerEmail]');

if(auditEmail){auditEmail.readOnly=true;const host=document.createElement('div');auditEmail.before(host);window.NistReminderRecipients.mount(host,row=>{auditEmail.value=row.email;document.querySelector('#aftForm [name=owner]').value=row.owner;});}


window.addEventListener('reminder-recipients-loaded',()=>{
 if(typeof updatePolicySelectOptions==='function')updatePolicySelectOptions('owners','policyRegisterOwner','Select owner');
 const owner=document.getElementById('policyRegisterOwner');if(!owner)return;
 let hint=document.getElementById('policyOwnerRecipientHint');if(!hint){hint=document.createElement('small');hint.id='policyOwnerRecipientHint';hint.className='muted';owner.after(hint);owner.addEventListener('change',()=>{const recipient=window.NistReminderRecipients.registered.find(row=>row.owner===owner.value);hint.textContent=recipient?'SMTP: '+recipient.email:'Owner ini belum terdaftar sebagai penerima SMTP.';});}
 owner.dispatchEvent(new Event('change'));
});

for(const id of ['globalSmtpTestTo','policySmtpTestTo','aftReminderTestTo']){
 const field=document.getElementById(id);if(!field)continue;const host=document.createElement('section');host.className='insight-panel smtp-wide';field.parentElement.before(host);window.NistReminderRecipients.mount(host,row=>{field.value=row.email;field.dispatchEvent(new Event('input'));},{canRegister:id==='globalSmtpTestTo'});
}
const broadcast=document.getElementById('aftReminderRecipients');
if(broadcast){const host=document.createElement('section');host.className='insight-panel';broadcast.before(host);window.NistReminderRecipients.mount(host,row=>{const emails=broadcast.value.split('\n').map(value=>value.trim()).filter(Boolean);if(!emails.includes(row.email))emails.push(row.email);broadcast.value=emails.join('\n');});}
