async function globalSmtpRequest(method, suffix = '', payload) {
  const response = await fetch(`/api/smtp-settings${suffix}`, {method, headers:{'Content-Type':'application/json'}, ...(payload === undefined ? {} : {body:JSON.stringify(payload)})});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Pengaturan SMTP gagal diproses.');
  return data;
}
function populateGlobalSmtp(data) {
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
    populateGlobalSmtp(await globalSmtpRequest('GET'));
    controls.forEach(control => {control.disabled = false;});
    $('globalSmtpStatus').textContent = 'Pengaturan siap diedit.';
  } catch(error) { $('globalSmtpStatus').textContent = `${error.message} Klik tab SMTP untuk mencoba kembali.`; }
});
$('globalSmtpForm').addEventListener('submit',async event => {
  event.preventDefault();const button=event.submitter;if(button)button.disabled=true;
  try {
    const payload={};
    for(const [field,id] of Object.entries({host:'Host',port:'Port',security:'Security',username:'Username',from:'From'})) payload[field]=field==='port'?Number($('globalSmtp'+id).value):$('globalSmtp'+id).value.trim();
    payload.password=$('globalSmtpPassword').value;payload.clearPassword=$('globalSmtpClearPassword').checked;
    populateGlobalSmtp(await globalSmtpRequest('PUT','',payload));
    $('globalSmtpStatus').textContent='SMTP tersimpan. Semua reminder menggunakan koneksi ini; jadwal dan penerima tidak berubah.';
  } catch(error) { $('globalSmtpStatus').textContent=error.message; }
  finally {if(button)button.disabled=false;}
});
$('globalSmtpTest').addEventListener('click',async()=>{
  const input=$('globalSmtpTestTo');if(!input.value||!input.reportValidity())return;
  $('globalSmtpTest').disabled=true;$('globalSmtpStatus').textContent='Mengirim email percobaan…';
  try {$('globalSmtpStatus').textContent=(await globalSmtpRequest('POST','/test',{to:input.value.trim()})).message;}
  catch(error){$('globalSmtpStatus').textContent=error.message;}
  finally{$('globalSmtpTest').disabled=false;}
});
$('policyOpenGlobalSmtp').addEventListener('click',()=>{
  $('accountButton').click();document.querySelector('[data-account-tab="smtp"]').click();
});
$('globalSmtpPolicyReminder').addEventListener('click',()=>{
  document.querySelector('[data-view="policy-register"]').click();$('policySmtpOpen').click();
});
