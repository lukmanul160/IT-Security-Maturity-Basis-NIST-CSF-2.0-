/**
 * Pemetaan kontrol dan field turunan gap, tanpa DOM/network.
 * Membaca snapshot kerangka kerja yang sudah dimuat; field CSF diturunkan
 * dari kontrol agar Domain/Sub tidak berbeda dari item assessment.
 */
function gapControlTitle(row) {
  const controls=row.framework==='ikas'?ikasRows:row.framework==='csf'?csfRows:row.framework==='privacy'?privacyRows:row.framework==='iso27001'?iso27001Rows:iso27001SoaRows;
  return controls.find(item=>item.id===row.controlCode)?.subcategory || row.controlCode;
}

function gapLinkedDetails(framework,code,details={}) {
  if(framework!=='csf')return details;
  const control=csfRows.find(row=>row.id===code);
  return {...details,domain:(control?.function||'').split(':')[0].trim(),sub:control?.subcategory?.match(/^\s*([^:]+):/)?.[1]?.trim()||code.replace(/^([A-Z]{2})-([A-Z]{2})-/, '$1.$2-')};
}
