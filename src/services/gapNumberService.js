/**
 * Layanan aplikasi/domain: gapNumberService.
 * Periksa dependency dan pemakai sebelum mengubah alur. Validasi, persistensi serta integrasi mengikuti kontrak fungsi pada file ini.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const codes={People:'PE',Process:'PR',Technology:'T'};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
function assign(details,rows,id) {
  const value={...details},mode=value.gapNumberMode || 'manual';
  const used=new Set(rows.filter(row=>row.id!==id).map(row=>(row.details?.gapNumber||'').trim().toUpperCase()).filter(Boolean));
  if(mode==='auto') {
    if(!value.sub || !codes[value.dimension])throw fail('Pilih Sub dan People/Process/Technology untuk nomor otomatis.');
    const prefix=`G-${value.sub.trim().toUpperCase()}-${codes[value.dimension]}-`;
    const current=(rows.find(row=>id && row.id===id)?.details?.gapNumber||'').trim().toUpperCase();
    const suffix=current.startsWith(prefix)?current.slice(prefix.length):'';
    if(!/^\d{2,}$/.test(suffix)||Number(suffix)<1||used.has(current)) {
      let last=0;
      for(const number of used)if(number.startsWith(prefix)&&/^\d+$/.test(number.slice(prefix.length)))last=Math.max(last,Number(number.slice(prefix.length)));
      if(!Number.isSafeInteger(last+1))throw fail('Nomor urut gap melebihi batas.');
      value.gapNumber=prefix+String(last+1).padStart(2,'0');
    }else value.gapNumber=current;
  }else if(mode!=='manual')throw fail('Mode nomor gap harus auto atau manual.');
  else value.gapNumber=(value.gapNumber||'').trim().toUpperCase();
  if(value.gapNumberMode==='manual'&&!value.gapNumber)throw fail('Nomor gap manual wajib diisi.');
  if(value.gapNumber && (value.gapNumber.length>120||!/^[A-Z0-9][A-Z0-9._-]*$/.test(value.gapNumber)))throw fail('Nomor gap maksimal 120 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.');
  if(used.has(value.gapNumber))throw fail('Nomor gap sudah digunakan. Gunakan nomor lain.',409);
  return value;
}
module.exports={assign,codes};
