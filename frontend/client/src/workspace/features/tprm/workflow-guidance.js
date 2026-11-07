/**
 * Panduan TPRM dari snapshot tersimpan, tanpa DOM, fetch, atau perubahan data.
 * File classic-script: runtime.js memasangnya sebelum lifecycle.js.
 */
/**
 * Menghasilkan langkah {target, message} sesuai tab, kelengkapan, dan aktor.
 * @param {object} data Snapshot API workflow; bukan nilai formulir yang belum disimpan.
 * @param {string} tab Tab workflow aktif.
 * @param {string} actor Username akun yang sedang login.
 * @param {boolean} writable Apakah akun memiliki izin TPRM Update.
 * @param {object} criticalLabels Nama kontrol kritis untuk pesan pengguna.
 * @returns {Array<{target: string, message: string}>} Panduan; keputusan tetap divalidasi server.
 */
function tprmNextSteps(data, tab, actor, writable, criticalLabels = {}) {
  const steps = [], assignments = data.assignments || {}, readiness = data.summary?.readiness || {};
  const add = (target, message) => steps.push({target, message});
  const closed = ['Offboarded','Terminated'].includes(data.relationshipStatus);
  if (closed) return [{target:'history',message:'Hubungan vendor sudah ditutup. Lihat History; buat record baru untuk hubungan berikutnya.'}];
  if (!writable) add('assignments','Akun ini tidak memiliki izin TPRM Update. Minta administrator memberikan akses untuk melakukan perubahan.');
  const labels = {requester:'pengusul',reviewer:'reviewer',approver:'approver'};
  const missing = Object.keys(labels).filter(key=>!assignments[key]);
  if (missing.length) add('assignments',`Admin perlu menetapkan ${missing.map(key=>labels[key]).join(', ')} pada Reviewer & Approver. Tiga akun harus berbeda.`);
  // Penugasan menentukan pelaku; izin halaman saja tidak cukup untuk transisi.
  const expected = {assessment:'requester',review:'reviewer',approval:'approver',monitoring:data.stage==='Approved'?'requester':'reviewer',offboarding:data.stage==='Offboarding'?'reviewer':'requester'}[tab];
  if (expected && assignments[expected] && assignments[expected]!==actor) add('assignments',`Langkah pada tab ini dilakukan oleh ${labels[expected]} yang ditugaskan: ${assignments[expected]}. Akun Anda tidak dapat menjalankan tindakan tersebut.`);
  if (tab==='assignments') {
    add('assignments','Hanya admin dapat menyimpan penugasan. Perubahan penugasan membatalkan review dan approval sebelumnya.');
  } else if (tab==='assessment') {
    // summary.complete menggabungkan profil, kuesioner, bukti, dan CIA.
    // Pesan CIA berupa pemeriksaan karena ringkasan tidak merinci indikator yang kosong.
    if (!data.profile?.owner || !['dataSensitivity','systemAccess','businessImpact','replaceability'].every(key=>[1,2,3].includes(Number(data.profile?.[key])))) add('assessment','Lengkapi PIC internal dan empat nilai kritikalitas, lalu simpan profil.');
    if (!readiness.total || readiness.answered!==readiness.total) add('questionnaire',`Lengkapi jawaban Yes/No/N/A dan keterangan setiap pertanyaan (${readiness.answered || 0}/${readiness.total || 0} lengkap).`);
    if (!readiness.documents) add('questionnaire','Unggah minimal satu dokumen pendukung di kuesioner.');
    if (!readiness.complete) add('questionnaire','Periksa empat skor due diligence di kuesioner; jawaban, skor, dan dokumen harus lengkap.');
    if (!data.summary?.complete) add('cia','Periksa sembilan indikator CIA melalui Isi CIA assessment; seluruh indikator wajib lengkap agar assessment dapat diajukan.');
    if (data.summary?.residual == null) add('risks','Lengkapi residual rating semua risiko terkait; bila tidak ada risiko, isi alasan hasil identifikasi tanpa gap dan simpan profil.');
    if (!(data.dependencies || []).length && !data.noDependenciesReason) add('assessment','Daftarkan subvendor/provider atau isi alasan tidak ada ketergantungan, lalu simpan profil.');
    if (!['Draft','Incomplete','Changes requested','Mitigation','Review required','Rejected'].includes(data.stage) && !(data.review && !data.reviewed)) add('review',`Tahap saat ini ${data.stage}. Pengajuan baru belum tersedia; lanjutkan review/approval atau mulai reassessment dari Activation & Monitoring.`);
    add('assessment','Simpan profil dan mitigasi sebelum Submit for review. Petunjuk kelengkapan memakai data terakhir yang tersimpan.');
  } else if (tab==='review') {
    if (!['Under review','Mitigation','Validated'].includes(data.stage)) add('assessment','Pengusul harus menyelesaikan assessment dan Submit for review sebelum reviewer dapat memvalidasi.');
    add('review','Untuk validasi: centang verifikasi bukti, isi catatan reviewer dan masa berlaku bukti di masa depan, lalu nilai keempat kontrol kritis beserta bukti/alasan N/A. Kontrol Fail wajib memiliki mitigasi terbuka.');
  } else if (tab==='approval') {
    if (!data.reviewed) add('review','Review belum valid atau data assessment berubah. Reviewer harus memvalidasi versi terbaru sebelum keputusan approval.');
    const failed=Object.entries(criticalLabels).filter(([key])=>!['Pass','N/A'].includes(data.criticalControls?.[key]?.status));
    if (failed.length) add('review',`Penerimaan belum dapat disetujui: kontrol ${failed.map(([,label])=>label).join(', ')} belum lulus. Perbaiki dan verifikasi kembali.`);
    add('approval','Isi keputusan dan alasannya. Untuk menerima vendor, masa berlaku approval harus di masa depan dan bukti masih berlaku.');
    if (data.summary?.residual>=70) add('approval','Residual risk tinggi: pilih Risk Acceptance yang disetujui dan masih berlaku, serta jelaskan kesesuaian cakupannya. Approver memerlukan izin baca Risk Acceptance.');
    if ((data.conditions || []).some(item=>!item.completed)) add('approval','Mitigasi masih terbuka: gunakan Approved with Conditions, isi batas akses, dan pastikan tenggat mitigasi di masa depan.');
  } else if (tab==='monitoring') {
    if (!data.approved) add('approval','Aktivasi belum dapat dilanjutkan: approval belum ada, berubah, ditolak, atau sudah tidak berlaku. Selesaikan review dan approval yang valid.');
    if (data.relationshipStatus!=='Active') add('monitoring','Untuk aktivasi: verifikasi seluruh checklist kontrak, pilih dokumen kontrak ditandatangani, isi referensi, tanggal, SLA, tenggat insiden, dan RTO/RPO (atau alasan N/A untuk vendor nonkritis).');
    if ((data.conditions || []).some(item=>item.preActivation!==false && !item.completed)) add('monitoring','Selesaikan seluruh mitigasi wajib sebelum aktivasi dan isi bukti verifikasi.');
    add('monitoring','Tanggal review berikutnya mengikuti batas tier, kontrak, bukti, dan approval. Kosongkan agar sistem menghitung jadwal otomatis saat aktivasi. Monitoring/reassessment memerlukan catatan atau alasan.');
  } else if (tab==='offboarding') {
    add('offboarding',data.stage==='Offboarding'?'Reviewer perlu memverifikasi tiga checklist penutupan, mengisi catatan, memilih dokumen bukti vendor, dan status akhir sebelum menutup hubungan.':'Pengusul atau approver yang ditugaskan perlu mengisi alasan lalu Start offboarding sebelum reviewer dapat menutup hubungan.');
  }
  return steps;
}
