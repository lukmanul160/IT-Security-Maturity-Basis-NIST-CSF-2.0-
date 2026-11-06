const XLSX=require('xlsx');
const headers=['No','Domain','Sub','People/ Process/ Technology','Gap Number','Gap','Client','PIC','Initiative','Recommendation','Year of Initiative','Kuartal','Konfirmasi','Evidence/ Dokumen Pendukung','Decision Note'];
function build(rows) {
  const data=rows.map((row,index)=>{
    const d=row.details||{};
    return [index+1,d.domain||'',d.sub||row.controlCode,d.dimension||'',d.gapNumber||'',row.description,d.client||'',d.pic||'',d.initiative||'',d.recommendation||'',d.yearOfInitiative||'',d.quarter||'',d.confirmation||'',[d.supportingDocuments,...(row.evidence||[]).map(file=>file.name+' ('+file.path+')')].filter(Boolean).join('\n'),d.decisionNote||''];
  });
  const sheet=XLSX.utils.aoa_to_sheet([headers,...data]);
  sheet['!cols']=headers.map(()=>({wch:28}));
  sheet['!autofilter']={ref:sheet['!ref']};
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Gap');
  return XLSX.write(book,{type:'buffer',bookType:'xlsx'});
}
module.exports={build,headers};
