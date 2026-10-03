let globalSmtpAccounts = [];
let globalSmtpAccountId = "default";
function populateSmtpAccountOptions(id, accounts, selected) {
  const select = $(id); select.replaceChildren();
  for (const account of accounts) { const option = document.createElement("option"); option.value = account.id; option.textContent = `${account.name} (${account.from || "belum dikonfigurasi"})`; select.append(option); }
  select.value = selected || "default";
}
async function loadGlobalSmtpAccounts(selected = "default") {
  globalSmtpAccounts = await globalSmtpRequest("GET", "/accounts");
  populateSmtpAccountOptions("globalSmtpAccount", globalSmtpAccounts, selected);
  globalSmtpAccountId = selected;
  populateGlobalSmtp(globalSmtpAccounts.find(account => account.id === selected));
}
async function globalSmtpRequest(method, suffix = '', payload) {
  const response = await fetch(`/api/smtp-settings${suffix}`, {method, headers:{'Content-Type':'application/json'}, ...(payload === undefined ? {} : {body:JSON.stringify(payload)})});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Pengaturan SMTP gagal diproses.');
  return data;
}
function populateGlobalSmtp(data) {
  $('globalSmtpName').value = data.name || 'SMTP bawaan';
  for (const [field,id] of Object.entries({host:'Host',port:'Port',security:'Security',username:'Username',from:'From'})) $('globalSmtp'+id).value = data[field];
  $('globalSmtpPassword').value = '';
  $('globalSmtpClearPassword').checked = false;
  $('globalSmtpPassword').placeholder = data.hasPassword ? 'Password tersimpan; kosongkan untuk mempertahankan' : 'Belum ada password tersimpan';
}
document.querySelector('[data-account-tab="smtp"]').addEventListener('click', async () => {
  if (currentUserRole !== 'admin') return;
  const controls = [...$('globalSmtpForm').elements];
  controls.forEach(control => {control.disabled = true;});
  $('globalSmtpStatus').textContent = 'Memuat SMTP terpusat…';
  try {
    await loadGlobalSmtpAccounts();
    controls.forEach(control => {control.disabled = false;});
    $('globalSmtpStatus').textContent = 'Pengaturan siap diedit.';
  } catch(error) { $('globalSmtpStatus').textContent = `${error.message} Klik tab SMTP untuk mencoba kembali.`; }
});
$('globalSmtpForm').addEventListener('submit',async event => {
  event.preventDefault();const button=event.submitter;if(button)button.disabled=true;
  try {
    const payload={name:$('globalSmtpName').value.trim()};
    for(const [field,id] of Object.entries({host:'Host',port:'Port',security:'Security',username:'Username',from:'From'})) payload[field]=field==='port'?Number($('globalSmtp'+id).value):$('globalSmtp'+id).value.trim();
    payload.password=$('globalSmtpPassword').value;payload.clearPassword=$('globalSmtpClearPassword').checked;
    const saved = await globalSmtpRequest(globalSmtpAccountId ? 'PUT' : 'POST',globalSmtpAccountId ? '/accounts/' + globalSmtpAccountId : '/accounts',payload);
    await loadGlobalSmtpAccounts(saved.id || globalSmtpAccountId);
    $('globalSmtpStatus').textContent='SMTP tersimpan. Pilih akun ini pada pengaturan reminder Policy Register atau Audit.';
  } catch(error) { $('globalSmtpStatus').textContent=error.message; }
  finally {if(button)button.disabled=false;}
});
$('globalSmtpTest').addEventListener('click',async()=>{
  if (!globalSmtpAccountId) { $('globalSmtpStatus').textContent='Simpan akun terlebih dahulu.'; return; }
  const input=$('globalSmtpTestTo');if(!input.value||!input.reportValidity())return;
  $('globalSmtpTest').disabled=true;$('globalSmtpStatus').textContent='Mengirim email percobaan…';
  try {$('globalSmtpStatus').textContent=(await globalSmtpRequest('POST','/test',{to:input.value.trim(),smtpAccountId:globalSmtpAccountId})).message;}
  catch(error){$('globalSmtpStatus').textContent=error.message;}
  finally{$('globalSmtpTest').disabled=false;}
});
$('policyOpenGlobalSmtp').addEventListener('click',()=>{
  $('accountButton').click();document.querySelector('[data-account-tab="smtp"]').click();
});
$('globalSmtpPolicyReminder').addEventListener('click',()=>{
  document.querySelector('[data-view="policy-register"]').click();$('policySmtpOpen').click();
});

$("globalSmtpAccount").addEventListener("change", () => { globalSmtpAccountId = $("globalSmtpAccount").value; populateGlobalSmtp(globalSmtpAccounts.find(account => account.id === globalSmtpAccountId)); });
$("globalSmtpAdd").addEventListener("click", () => { globalSmtpAccountId = null; $("globalSmtpAccount").value = ""; populateGlobalSmtp({name:"",host:"",port:587,security:"starttls",username:"",from:""}); $("globalSmtpName").value=""; $("globalSmtpName").focus(); $("globalSmtpStatus").textContent="Isi koneksi lalu simpan untuk mendaftarkan akun baru."; });
