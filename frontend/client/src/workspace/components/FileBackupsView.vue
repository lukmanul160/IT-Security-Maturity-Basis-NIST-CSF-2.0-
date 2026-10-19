<template>
<section v-pre id="fileBackupsView" class="view backup-page">
  <div class="page-heading backup-page-heading"><div><p class="eyebrow">BACKUP SYSTEM</p><h2>File Backup</h2><p class="lede">Cadangkan seluruh file yang telah diunggah, termasuk foto depan/belakang aset, foto rak, dan gambar Knowledge Notes dalam arsip ZIP.</p></div><div class="csf-actions backup-primary-action"><button class="button button-accent" id="fileBackupCreateButton" type="button">Create file backup</button><span class="file-count" id="fileBackupCount">0 backups</span></div></div>
  <div class="file-backup-options">
    <div class="file-backup-field"><label for="fileBackupFolder">Folder untuk backup</label><input id="fileBackupFolder" type="hidden" value=""><div id="fileBackupFolderTree" class="file-backup-folder-tree" role="group" aria-label="Folder untuk backup"></div><small>Centang beberapa folder atau Semua folder. Gunakan panah untuk membuka/tutup subfolder.</small></div>
    <div class="file-backup-field"><label for="fileBackupRestoreFolder">Folder untuk restore</label><input id="fileBackupRestoreFolder" type="hidden" value=""><div id="fileBackupRestoreFolderTree" class="file-backup-folder-tree" role="group" aria-label="Folder dalam backup"></div><small>Pilih ZIP backup terlebih dahulu. Folder diambil dari isi backup; semua file dipulihkan ke path asal pada storage aktif.</small></div>
    <p class="file-backup-help"><strong>500 MB adalah batas per bagian ZIP, bukan batas total backup.</strong> Batch otomatis selalu aktif: seluruh folder dan file tunggal di atas 500 MB tetap dicadangkan dalam beberapa ZIP, lalu disatukan kembali saat batch restore. Tidak ada batas ukuran total atau jumlah file dari aplikasi; kapasitas mengikuti ruang storage yang tersedia. File yang hilang tidak menghentikan backup file lain dan dilaporkan sebagai backup belum lengkap. Cadangkan database juga untuk data dan referensi lampiran.</p>
  </div>
  <div class="backup-restore-panel"><div><p class="eyebrow">RECOVERY CONTROL</p><h3>Restore files</h3><p class="muted">Pilih satu ZIP atau seluruh bagian ZIP dari satu batch File Backup NIST Basis (maksimal 500 MB per bagian). Semua bagian divalidasi sebelum file dipulihkan. File dengan path yang sama akan diganti; file lain tetap tersimpan. Restore menggunakan lokasi storage aktif. Pulihkan Database Backup terlebih dahulu jika data dan referensi lampiran juga perlu dipulihkan.</p></div><div class="backup-restore-actions"><label class="button button-quiet" for="fileBackupRestoreInput">Tambah file ZIP backup<input id="fileBackupRestoreInput" type="file" accept=".zip" multiple hidden></label><button id="fileBackupRestoreClearButton" type="button" class="button button-quiet" hidden>Kosongkan pilihan</button><span class="muted" id="fileBackupRestoreFileName">No file selected</span><button class="button button-danger" id="fileBackupRestoreButton" type="button" disabled>Restore selected batch</button></div></div>
  <p class="muted">Pilih beberapa ZIP dengan Ctrl/Shift, atau tambahkan satu per satu. Pilihan sebelumnya tetap tersimpan; pilih seluruh ZIP dari batch yang sama sebelum restore.</p>
  <ul id="fileBackupRestoreQueue" class="upload-selected-files" aria-label="Daftar ZIP untuk dipulihkan" hidden></ul>
  <ul id="fileBackupSelectedFiles" class="upload-selected-files" aria-label="File ZIP yang dipilih untuk restore" hidden></ul>
  <div id="fileBackupProgressPanel" class="backup-operation-progress" hidden><div class="upload-progress-heading"><strong data-progress-label>Menyiapkan...</strong><span data-progress-percent>0%</span></div><progress max="100" value="0" aria-label="Progres File Backup"></progress><p class="upload-progress-detail" data-progress-detail role="status"></p></div>
  <div class="section-heading backup-archive-heading"><div><p class="eyebrow">BACKUP ARCHIVE</p><h3>Available file backups</h3><p class="muted" id="fileBackupStatus" role="status">Backup hanya dapat diakses administrator.</p></div></div>
  <div class="excel-wrap backup-archive-table"><table class="excel-table"><thead><tr><th>File</th><th>Created</th><th>Size</th><th>Actions</th></tr></thead><tbody id="fileBackupBody"></tbody></table></div>
</section>
</template>

<style>
#fileBackupsView .file-backup-folder-tree{max-height:320px;overflow:auto;border:1px solid var(--line,#d8e3f1);border-radius:8px;padding:6px;background:var(--surface,#fff)}
#fileBackupsView .file-backup-folder-row{display:flex;align-items:center;gap:6px;min-height:36px;border-radius:5px}
#fileBackupsView .file-backup-folder-row:hover{background:var(--line,#eef2ff)}
#fileBackupsView .file-backup-folder-row label{display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;padding:7px 4px;min-width:0;overflow-wrap:anywhere}
#fileBackupsView .file-backup-folder-row input[type=checkbox]{width:16px;min-height:16px;height:16px;flex:0 0 16px;margin:0;padding:0;accent-color:#7056b5}
#fileBackupsView .file-backup-folder-toggle{width:26px;height:28px;flex:0 0 26px;padding:0;border:0;background:transparent;color:inherit;cursor:pointer}
#fileBackupsView .file-backup-folder-toggle:disabled{opacity:.35;cursor:default}
#fileBackupsView .file-backup-folder-children{margin-left:20px}
#fileBackupsView .file-backup-folder-children[hidden]{display:none}
#fileBackupsView .file-backup-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px 24px;padding:22px 24px;margin-bottom:24px;border:1px solid var(--line,#e5ebf3);border-radius:10px;background:#fff;box-shadow:0 1px 2px #0f172a08}
#fileBackupsView .file-backup-field{display:flex;flex-direction:column;gap:8px;min-width:0}
#fileBackupsView .file-backup-field label{color:var(--navy,#243f61);font-size:13px;font-weight:600;line-height:1.5}
#fileBackupsView .file-backup-field :is(input,select){display:block;width:100%;min-width:0;box-sizing:border-box;min-height:42px;padding:10px 12px;border:1px solid #d8e3f1;border-radius:8px;background:#fff;color:var(--ink,#182338);font:inherit;font-size:13px;line-height:1.5}
#fileBackupsView .file-backup-field :is(input,select):focus{outline:2px solid #93b8ff;outline-offset:2px;border-color:#608fea}
#fileBackupsView .file-backup-field input::placeholder{color:#8191a8}
#fileBackupsView .file-backup-field small,#fileBackupsView .file-backup-help{color:var(--muted,#64748b);font-size:12px;line-height:1.7}
#fileBackupsView .file-backup-help{grid-column:1/-1;margin:0;padding-top:16px;border-top:1px solid var(--line,#e5ebf3)}
#fileBackupsView .backup-restore-panel{background:#f8faff;border-color:#dce6f5;box-shadow:none;align-items:flex-start}
#fileBackupsView .backup-restore-panel>div:first-child{flex:1;min-width:0}
#fileBackupsView .backup-restore-actions{max-width:420px;align-self:center;gap:10px}
#fileBackupsView .backup-restore-panel .muted{line-height:1.7}
@media(max-width:700px){#fileBackupsView .file-backup-options{grid-template-columns:minmax(0,1fr);padding:18px;gap:18px}#fileBackupsView .backup-page-heading{flex-wrap:wrap}#fileBackupsView .backup-restore-panel{flex-direction:column;padding:18px;gap:16px}#fileBackupsView .backup-restore-actions{align-self:stretch;justify-content:flex-start;max-width:none}}
</style>
