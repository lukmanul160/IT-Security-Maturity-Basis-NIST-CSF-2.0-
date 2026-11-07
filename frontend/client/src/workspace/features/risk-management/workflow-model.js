/**
 * Model panduan dan pilihan aksi Risk Workflow, tanpa DOM/network.
 * rwAvailable membaca identitas/izin runtime; rwGuidance memakai snapshot
 * input dan tanggal Bangkok. Validasi keputusan tetap di server.
 */
/** Turunkan aksi yang tersedia dari tahap dan aktor; server tetap memvalidasi transisi sebenarnya. */
function rwAvailable(data) {
  if (!canPerform('risk-management', 'update')) return [];
  const out = ({ Draft: ['assess'], Assessed: ['submit', 'requestClosure', 'reassess'], 'Pending Approval': ['approve', 'reject', 'reassess'], 'In Treatment': ['complete', 'reassess'], 'Pending Verification': ['verify', 'reassess'], Monitoring: ['review', 'requestClosure', 'reassess'], Accepted: ['review', 'requestClosure', 'reassess'], 'Pending Closure': ['close', 'reject', 'reassess'], Closed: ['reassess'] })[data.stage] || [];
  return out.filter(action => {
    if (data.effectiveStage === 'Review Required' && !['reassess', 'requestClosure', 'close', 'reject'].includes(action)) return false;
    if (['approve', 'reject', 'close'].includes(action)) return rwIdentity?.username === data.approver && ['admin', 'approver'].includes(rwIdentity?.role) && rwIdentity.username !== data.submittedBy;
    if (action === 'verify') return rwIdentity?.username === data.reviewer && rwIdentity.username !== data.implementedBy;
    return true;
  });
}

/** Susun masalah kelengkapan per bagian dari snapshot risk dan workflow, termasuk syarat tanggal/skor. */
function rwGuidance(data,risk={}) {
  const stage=data.effectiveStage || data.stage;
  const messages={Draft:['Lengkapi penilaian risiko','Isi identifikasi dan inherent di Data risiko, lalu threat, vulnerability, alasan skor, dan current assessment di sini.'],Assessed:['Lengkapi rencana dan ajukan approval','Pilih treatment, PIC, dan deadline di Data risiko. Lengkapi tolerance, approver, reviewer, serta target residual di sini.'], 'Pending Approval':['Menunggu keputusan approver',`Akun approver: ${data.approver || 'belum dipilih'}. Pemohon tidak dapat menyetujui pengajuan sendiri.`], 'In Treatment':['Laksanakan rencana penanganan','Catat progress dan evidence. Ajukan verifikasi setelah progress 100% dan bukti tindakan tersedia.'], 'Pending Verification':['Periksa hasil dan residual aktual',`Reviewer: ${data.reviewer || 'belum dipilih'}. Lengkapi residual aktual di Data risiko, hasil verifikasi, dan review date di sini.`],Monitoring:['Pantau efektivitas kontrol','Catat evidence dan tanggal review berikutnya. Penutupan hanya bila sumber risiko hilang atau tidak relevan lagi.'],Accepted:['Pantau masa berlaku acceptance','Review berkala tetap diperlukan. Acceptance tidak diperpanjang otomatis.'], 'Pending Closure':['Menunggu persetujuan penutupan',`Akun approver: ${data.approver || 'belum dipilih'}. Periksa alasan dan evidence sebelum menyetujui.`],Closed:['Risiko telah ditutup','Histori tetap dapat dibaca. Gunakan Assessment ulang bila risiko perlu dibuka kembali.'], 'Review Required':['Assessment perlu diulang','Data atau masa berlaku berubah. Periksa penyebabnya, lalu gunakan Assessment ulang sebelum keputusan baru.']};
  const [title,description]=messages[stage] || ['Tinjau status risiko','Periksa data dan histori sebelum melanjutkan.'];
  const missing=[],issues=[];
  const addIssue=(source,key,label,where,reason='wajib diisi')=>{
    const location=source===risk?'register':'workflow',id=(location==='register'?'rm':'rw')+key[0].toUpperCase()+key.slice(1);
    if(issues.some(issue=>issue.id===id))return;
    missing.push(`${label} (${where})`);issues.push({id,location,label,where,reason});
  };
  const requireFields=(source,fields,where)=>fields.forEach(([key,label])=>{
    const value=source[key],text=String(value??'').trim();
    const score=['likelihood','impact','currentLikelihood','currentImpact','targetLikelihood','targetImpact','residualLikelihood','residualImpact'].includes(key);
    if(!text)addIssue(source,key,label,where);
    else if(score&&(!Number.isInteger(Number(value))||Number(value)<1||Number(value)>5))addIssue(source,key,label,where,'harus bernilai 1-5');
    else if(key==='toleranceScore'&&(!Number.isInteger(Number(value))||Number(value)<1||Number(value)>25))addIssue(source,key,label,where,'harus bernilai 1-25');
  });
  if(['Draft','Assessed'].includes(stage)){
    requireFields(risk,[['riskCategory','Kategori'],['effectedAsset','Aset'],['riskOwner','Risk owner'],['identificationRisk','Deskripsi risiko'],['riskCause','Penyebab'],['riskControl','Kontrol existing'],['riskAnalysis','Analisis'],['likelihood','Inherent likelihood'],['impact','Inherent impact']],'Data risiko');
    requireFields(data,[['threat','Threat'],['vulnerability','Vulnerability'],['likelihoodRationale','Alasan likelihood'],['impactRationale','Alasan impact'],['currentLikelihood','Current likelihood'],['currentImpact','Current impact']],'Penilaian');
  }
  if(stage==='Assessed'){
    requireFields(data,[['approver','Approver'],['reviewer','Reviewer'],['toleranceScore','Tolerance'],['toleranceRationale','Dasar tolerance']],'Alur risiko');
    requireFields(risk,[['treatmentAction','Treatment']],'Data risiko');
    if(risk.treatmentAction==='Acceptance')requireFields(data,[['acceptanceFormId','Form acceptance disahkan'],['acceptanceReason','Justifikasi'],['acceptanceConditions','Kondisi'],['acceptanceExpiry','Expiry'],['reviewDate','Review date']],'Acceptance');
    else {requireFields(risk,[['ownerOfAction','PIC'],['deadline','Deadline'],['riskTreatmentDescription','Rencana tindakan']],'Data risiko');requireFields(data,[['targetLikelihood','Target likelihood'],['targetImpact','Target impact']],'Alur risiko');}
  }
  if(stage==='In Treatment'){if(Number(data.progress)!==100)addIssue(data,'progress','Progress 100%','Pelaksanaan','harus mencapai 100%');requireFields(data,[['evidence','Evidence tindakan']],'Pelaksanaan');}
  if(stage==='Pending Verification'){requireFields(risk,[['residualLikelihood','Residual likelihood'],['residualImpact','Residual impact']],'Data risiko');requireFields(data,[['verificationNotes','Hasil verifikasi'],['evidence','Evidence'],['reviewDate','Review berikutnya']],'Verifikasi');}
  if(['Monitoring','Accepted'].includes(stage))requireFields(data,[['evidence','Evidence review'],['reviewDate','Review berikutnya']],'Review');
  if(stage==='Pending Closure')requireFields(data,[['closureReason','Alasan closure'],['evidence','Evidence penutupan']],'Penutupan');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const checkDate=(source,key,label,where,strict=false)=>{
    const value=String(source[key]??'');if(!value)return;
    const parsed=new Date(value+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)addIssue(source,key,label,where,'harus berupa tanggal kalender yang valid');
    else if(strict?value<=today:value<today)addIssue(source,key,label,where,strict?'harus setelah hari ini':'tidak boleh sebelum hari ini');
  };
  if(stage==='Assessed'){
    if(!['Acceptance','Mitigation','Transfer','Avoidance'].includes(risk.treatmentAction))addIssue(risk,'treatmentAction','Treatment','Data risiko','pilih Acceptance, Mitigation, Transfer, atau Avoidance');
    if(risk.treatmentAction==='Acceptance'){checkDate(data,'acceptanceExpiry','Expiry','Acceptance',true);checkDate(data,'reviewDate','Review date','Acceptance');if(data.reviewDate&&data.acceptanceExpiry&&data.reviewDate>data.acceptanceExpiry)addIssue(data,'reviewDate','Review date','Acceptance','tidak boleh melewati expiry');}
    else checkDate(risk,'deadline','Deadline','Data risiko');
  }
  if(['Pending Verification','Monitoring','Accepted'].includes(stage))checkDate(data,'reviewDate','Review berikutnya','Review',['Monitoring','Accepted'].includes(stage));
  return {title,description,missing,issues};
}
