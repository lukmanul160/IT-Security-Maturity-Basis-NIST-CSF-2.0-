<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<section v-pre id="filesView" class="view">

          <div class="page-heading"><div><p class="eyebrow">EVIDENCE LIBRARY</p><h2>Uploaded files</h2><p class="lede">Kelola file yang Anda upload. Admin dapat mengelola seluruh file.</p></div><span class="file-count" id="uploadedFileCount">0 files</span></div>
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
              <label class="uploaded-file-replacement">File pengganti<input id="uploadedFileEditInput" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,.png,.jpg,.jpeg,.gif,.webp,image/png,image/jpeg,image/gif,image/webp" required><small id="uploadedFileEditHint">Pilih file dengan format yang sama.</small></label>
              <label class="uploaded-file-replacement" id="uploadedPdfOpenPageField">Halaman awal saat PDF dibuka<input id="uploadedPdfOpenPage" type="number" min="1" max="100000" value="1"><small>Masukkan nomor halaman PDF yang ingin ditampilkan saat Open.</small></label>
              <p class="muted">Path file dipertahankan agar semua referensi evidence yang memakai file ini tetap terhubung.</p>
              <div class="csf-form-actions"><button class="button button-accent" id="uploadedFileEditSubmit" type="submit">Ganti file</button><button class="button button-quiet" id="uploadedPdfOpenPageSave" type="button">Simpan halaman PDF</button><button class="button button-quiet" id="uploadedFileEditSourceButton" type="button">Buka lokasi asal</button><button class="button button-quiet" id="uploadedFileEditCancel" type="button">Batal</button><span class="save-state" id="uploadedFileEditStatus">Ready</span></div>
            </form>
          </dialog>
        </section>
</template>
