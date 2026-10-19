'use strict';
const $=id=>document.getElementById(id),form=$('form'),canvas=$('signature');
let receiptId='',type,strokes=[],current=null,sent=false,previewVersion=0,signatureImage='',uploadVersion=0;
const assignmentYear=new URLSearchParams(location.search).get('year')||'';
const typeId=location.pathname.split('/').filter(Boolean).pop();
const message=(text,error=false)=>{$('message').textContent=text;$('message').classList.toggle('error',error);};
function values(){const data={};for(const f of type.fields)data[f.key]=form.elements.namedItem(f.key)?.value||'';return data;}
function renderFields(){
 $('publicFields').replaceChildren();
 for(const field of type.fields.filter(f=>f.public!==false)){const label=document.createElement('label');const labelText=document.createElement('span');labelText.textContent=field.label;label.append(labelText);if(field.required)label.append(' *');const input=document.createElement(field.type==='select'?'select':field.type==='textarea'?'textarea':'input');input.name=field.key;input.required=field.required;if(field.type==='select'&&field.key!=='status')input.setAttribute('data-user-options','');
 if(field.type==='select'){const empty=document.createElement('option');empty.value='';empty.textContent='Pilih...';input.append(empty);for(const value of field.options){const option=document.createElement('option');option.value=value;option.textContent=value;input.append(option);}}
 else if(field.type!=='textarea')input.type=field.type;
 if(['text','textarea','email'].includes(field.type))input.maxLength=field.type==='textarea'?4000:field.key==='nip'?80:500;
 if(field.type==='date')input.value=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
 if(field.key==='nama')input.autocomplete='name';
 const profileKeys={nip:'nip',nama:'name',departemen:'department',jabatan:'position',status:'status',penyedia:'provider'};const profileValue=type.employee?.[profileKeys[field.key]];if(profileValue&&(!field.options||field.options.includes(profileValue)))input.value=profileValue;if(['nip','nama'].includes(field.key))input.readOnly=true;
 if(field.key==='nip')input.pattern='[A-Za-z0-9._/\\-]+';
 label.append(input);$('publicFields').append(label);
 }
 updateIdentity();
}
function updateIdentity(){const data=values();$('signer').textContent=data.nama||window.NistI18n?.t('Nama penandatangan')||'Nama penandatangan';if(data.nama)$('signer').setAttribute('data-no-translate','');else $('signer').removeAttribute('data-no-translate');const provider=form.elements.namedItem('penyedia');if(provider){const config=type.fields.find(f=>f.key==='penyedia');provider.required=config.required||data.status==='Outsource';}}
function draw(target,lines){const ctx=target.getContext('2d');ctx.clearRect(0,0,target.width,target.height);ctx.strokeStyle='#15283f';ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';for(const line of lines){ctx.beginPath();line.forEach((p,i)=>i?ctx.lineTo(p[0]*target.width,p[1]*target.height):ctx.moveTo(p[0]*target.width,p[1]*target.height));ctx.stroke();}}
function point(e){const r=canvas.getBoundingClientRect();return[Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
canvas.addEventListener('pointerdown',e=>{if($('signatureMethod').value!=='draw'||current||strokes.length>=150)return;canvas.setPointerCapture(e.pointerId);current=[point(e)];strokes.push(current);});
canvas.addEventListener('pointermove',e=>{if(!current||current.length>=2000)return;current.push(point(e));draw(canvas,strokes);});
function endStroke(){if(current?.length<2)strokes.pop();current=null;}
canvas.addEventListener('pointerup',endStroke);canvas.addEventListener('pointercancel',endStroke);
function clearSignature(){uploadVersion++;strokes=[];current=null;signatureImage='';$('signatureFile').value='';$('signatureImagePreview').hidden=true;$('signatureImagePreview').removeAttribute('src');$('signatureUploadStatus').textContent='';draw(canvas,strokes);$('submit').disabled=false;}
$('clear').onclick=clearSignature;
$('signatureMethod').onchange=()=>{clearSignature();const upload=$('signatureMethod').value==='upload';canvas.hidden=upload;$('signatureUpload').hidden=!upload;};
$('signatureFile').onchange=async()=>{
 const file=$('signatureFile').files[0],version=++uploadVersion;signatureImage='';$('signatureImagePreview').hidden=true;
 if(!file)return;
 const status=text=>{$('signatureUploadStatus').textContent=text;};
 if(!['image/png','image/jpeg'].includes(file.type)||file.size>5*1024*1024){status('Pilih gambar PNG atau JPG dengan ukuran maksimum 5 MB.');return;}
 $('submit').disabled=true;status('Menyiapkan gambar tanda tangan...');
 try{const bitmap=await createImageBitmap(file);if(version!==uploadVersion){bitmap.close();return;}if(bitmap.width>12000||bitmap.height>12000){bitmap.close();throw Error('Dimensi gambar terlalu besar.');}
 const target=document.createElement('canvas');target.width=1000;target.height=400;const ctx=target.getContext('2d');const scale=Math.min(1000/bitmap.width,400/bitmap.height);const w=bitmap.width*scale,h=bitmap.height*scale;ctx.drawImage(bitmap,(1000-w)/2,(400-h)/2,w,h);bitmap.close();const pixels=ctx.getImageData(0,0,1000,400);let ink=0;for(let i=0;i<pixels.data.length;i+=4){if(pixels.data[i]>240&&pixels.data[i+1]>240&&pixels.data[i+2]>240)pixels.data[i+3]=0;if(pixels.data[i+3]>30&&Math.min(pixels.data[i],pixels.data[i+1],pixels.data[i+2])<230)ink++;}if(ink<15||ink>400000*.95)throw Error('Gambar tanda tangan tidak valid.');ctx.putImageData(pixels,0,0);signatureImage=target.toDataURL('image/png');$('signatureImagePreview').src=signatureImage;$('signatureImagePreview').hidden=false;status('Gambar tanda tangan siap digunakan.');
 }catch(error){status(error.message||'Gambar tanda tangan tidak valid.');}finally{if(version===uploadVersion)$('submit').disabled=false;}
};
form.addEventListener('input',()=>{if(type){updateIdentity();$('previewStatus').textContent='Data berubah. Klik Perbarui pratinjau untuk melihat isi terbaru.';}});
async function updatePreview(){const version=++previewVersion;$('updatePreview').disabled=true;$('previewStatus').textContent='Menyiapkan pratinjau Word...';try{const response=await fetch('/api/public/statements/'+encodeURIComponent(typeId)+'/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...values(),revision:type.revision,assignmentYear:assignmentYear||type.assignmentYear})});const buffer=await StatementWord.responseBuffer(response);if(version!==previewVersion)return;await StatementWord.render(buffer,$('preview'));$('previewStatus').textContent='Pratinjau sesuai data terakhir Anda. Tanda tangan dimasukkan setelah surat dikirim.';}catch(error){$('previewStatus').textContent=error.message;}finally{if(version===previewVersion)$('updatePreview').disabled=false;}}
$('updatePreview').onclick=updatePreview;
form.addEventListener('submit',async e=>{e.preventDefault();if(sent)return;if(!strokes.length&&!signatureImage){message('Bubuhkan tanda tangan terlebih dahulu.',true);canvas.scrollIntoView({block:'center'});return;}$('submit').disabled=true;message('Menyimpan surat dan menyiapkan dokumen Word...');const data={...values(),...(signatureImage?{signatureImage}:{signature:strokes}),consent:form.elements.consent.checked,revision:type.revision,assignmentYear:assignmentYear||type.assignmentYear};
 try{const response=await fetch('/api/public/statements/'+encodeURIComponent(typeId),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Gagal menyimpan surat.');sent=true;receiptId=result.id;$('receiptNumber').textContent=(window.NistI18n?.t('Nomor penerimaan')||'Nomor penerimaan')+': '+result.id;const buffer=StatementWord.fromBase64(result.documentContent);StatementWord.downloadLink($('downloadSigned'),buffer,type.title.replace(/[\\/:*?"<>|]/g,'-')+'.docx');form.hidden=true;$('receipt').hidden=false;message('Terima kasih. Surat pernyataan Anda telah diterima.');window.scrollTo(0,0);try{await StatementWord.render(buffer,$('savedDocument'));}catch{$('savedDocument').textContent='Pratinjau belum tersedia. Surat sudah tersimpan dan dapat diunduh melalui tombol Unduh surat Word.';}}
 catch(error){message(error.message,true);}finally{$('submit').disabled=false;}
});
window.addEventListener('nist:language-change',()=>{if(receiptId)$('receiptNumber').textContent=window.NistI18n.t('Nomor penerimaan')+': '+receiptId;if(type)updateIdentity();});
$('printSigned').onclick=()=>StatementWord.print($('savedDocument'));
(async()=>{try{const response=await fetch('/api/public/statements/'+encodeURIComponent(typeId)+'?'+new URLSearchParams({year:assignmentYear}),{cache:'no-store'});const result=await response.json();if(response.status===401){location.assign('/surat-pernyataan?'+new URLSearchParams({next:location.pathname+location.search}));return;}if(!response.ok)throw new Error(result.error||'Surat tidak tersedia.');type=result;$('title').textContent=type.title;document.title=type.title;renderFields();form.hidden=false;message('');await updatePreview();}catch(error){message(error.message,true);}})();
