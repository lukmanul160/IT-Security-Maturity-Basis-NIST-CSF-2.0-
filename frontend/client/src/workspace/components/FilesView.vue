<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<section v-pre id="filesView" class="view">
          <details id="fileStorageSettings" class="file-storage-settings" hidden>
            <summary id="fileStorageOpen">Pengaturan penyimpanan upload</summary>
            <form id="fileStorageForm">
              <p>Pilih lokasi untuk upload evidence dan lampiran kebijakan berikutnya. File yang sudah ada tetap menggunakan lokasi asal; mengganti file juga memakai lokasi asal.</p>
              <fieldset id="fileStorageFields" disabled>
                <label for="fileStorageMode">Lokasi penyimpanan</label>
                <select id="fileStorageMode"><option value="local">Lokal — folder upload aplikasi</option><option value="shared">Storage file — folder jaringan / NAS</option></select>
                <p id="fileStorageLocal" class="muted"></p>
                <div id="fileStorageDirectoryGroup" hidden>
                  <label for="fileStorageDirectory">Path folder storage di server</label>
                  <input id="fileStorageDirectory" type="text" placeholder="Contoh: \\NAS\dokumen\nist atau D:\NistStorage" autocomplete="off">
                  <p class="muted">Gunakan folder khusus yang sudah tersedia. Akun yang menjalankan server harus memiliki izin baca, tulis, dan hapus. Folder ini berada di server/NAS, bukan di komputer browser.</p>
                </div>
                <div class="csf-form-actions"><button id="fileStorageTest" class="button button-quiet" type="button">Tes akses folder</button><button id="fileStorageSave" class="button button-accent" type="submit">Simpan pengaturan</button></div>
              </fieldset>
              <p id="fileStorageStatus" role="status" aria-live="polite">Buka pengaturan untuk memuat lokasi penyimpanan.</p>
              <p class="muted">Penyimpanan memerlukan metadata database. Sertakan semua folder file yang digunakan saat melakukan backup.</p>
            </form>
          </details>
          <div class="page-heading"><div><p class="eyebrow">EVIDENCE LIBRARY</p><h2>Uploaded files</h2><p class="lede">Daftar file yang sudah diupload beserta lokasi fungsi, kategori, dan subkategori.</p></div><span class="file-count" id="uploadedFileCount">0 files</span></div>
          <div class="toolbar"><label class="search-box"><span>/</span><input id="uploadedFileSearch" type="search" placeholder="Search uploaded files..." autocomplete="off"></label><select id="uploadedFileKindFilter" aria-label="Filter file type"><option value="all">Policy & Practice</option><option value="policy">Policy</option><option value="practice">Practice</option></select></div>
          <div class="uploaded-files-wrap"><table class="uploaded-files-table"><thead><tr><th>File</th><th>Assessment</th><th>Function</th><th>Category</th><th>Subcategory</th><th>Type</th><th>Uploaded</th><th>Actions</th></tr></thead><tbody id="uploadedFilesBody"></tbody></table><div class="assessment-pagination" id="uploadedFilesPagination"></div></div>
          <dialog id="uploadedFileEditModal" class="certification-modal">
            <form id="uploadedFileEditForm" class="risk-register-form uploaded-file-edit-form">
              <input id="uploadedFileEditRecordId" type="hidden">
              <div class="section-heading compact"><div><p class="eyebrow">EDIT UPLOADED FILE</p><h3 id="uploadedFileEditTitle">Ganti file evidence</h3></div><span class="framework-badge" id="uploadedFileEditSource">Assessment</span></div>
              <div class="uploaded-file-edit-context">
                <div><span>File saat ini</span><strong id="uploadedFileEditCurrentName">-</strong><small id="uploadedFileEditCurrentPath">-</small></div>
                <div><span>Lokasi penggunaan</span><strong id="uploadedFileEditLocation">-</strong><small id="uploadedFileEditControl">-</small></div>
              </div>
              <label class="uploaded-file-replacement">File pengganti<input id="uploadedFileEditInput" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" required><small id="uploadedFileEditHint">Pilih file dengan format yang sama.</small></label>
              <p class="muted">Path file dipertahankan agar semua referensi evidence yang memakai file ini tetap terhubung.</p>
              <div class="csf-form-actions"><button class="button button-accent" id="uploadedFileEditSubmit" type="submit">Ganti file</button><button class="button button-quiet" id="uploadedFileEditSourceButton" type="button">Buka lokasi asal</button><button class="button button-quiet" id="uploadedFileEditCancel" type="button">Batal</button><span class="save-state" id="uploadedFileEditStatus">Ready</span></div>
            </form>
          </dialog>
        </section>
</template>
