<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<section v-pre id="policyRegisterView" class="view">

          <div class="page-heading"><div><p class="eyebrow">GOVERNANCE DOCUMENTATION</p><h2>Policy Register</h2><p class="lede">Daftar kebijakan, prosedur, dan pemiliknya yang berlaku sebagai kontrol operasional organisasi.</p></div><div class="csf-actions"><button class="button button-accent" id="policyRegisterNewButton" type="button">New policy</button><span class="file-count" id="policyRegisterCount">0 policies</span></div></div>
          <div class="risk-dashboard-grid"><article class="stat-panel"><span class="stat-label">Total policies</span><strong id="policyRegisterTotalValue">0</strong><span class="stat-detail">registered in register</span></article><article class="stat-panel"><span class="stat-label">Approved</span><strong id="policyRegisterApprovedValue">0</strong><span class="stat-detail">latest approved versions</span></article><article class="stat-panel"><span class="stat-label">Review due</span><strong id="policyRegisterDueValue">0</strong><span class="stat-detail">within 30 days</span></article><article class="stat-panel"><span class="stat-label">Owners</span><strong id="policyRegisterOwnerValue">0</strong><span class="stat-detail">responsible roles assigned</span></article></div>
          <dialog id="policyRegisterModal" class="certification-modal risk-management-modal"><form id="policyRegisterForm" class="risk-register-form" enctype="multipart/form-data"><input id="policyRegisterId" type="hidden"><div class="section-heading compact"><div><p class="eyebrow">POLICY REGISTER ENTRY</p><h3 id="policyRegisterFormTitle">New policy</h3></div><span class="save-state" id="policyRegisterStatus">Ready</span></div>
            <div class="risk-register-grid">
              <label>Policy title<input id="policyRegisterTitle" required maxlength="200"></label>
              <div class="dropdown-input-group"><label>Category<select id="policyRegisterCategory" required><option value="">Select category</option></select></label><button type="button" class="dropdown-edit-btn" data-dropdown-key="categories" title="Manage categories">⚙️</button></div>
              <div class="dropdown-input-group"><label>Owner<select id="policyRegisterOwner" required><option value="">Select owner</option></select></label><button type="button" class="dropdown-edit-btn" data-dropdown-key="owners" title="Manage owners">⚙️</button></div>
              <div class="dropdown-input-group"><label>Review cycle<select id="policyRegisterReviewCycle" required><option value="">Select review cycle</option></select></label><button type="button" class="dropdown-edit-btn" data-dropdown-key="reviewCycles" title="Manage cycles">⚙️</button></div>
              <div class="dropdown-input-group"><label>Approval status<select id="policyRegisterApprovalStatus" required><option value="">Select approval status</option></select></label><button type="button" class="dropdown-edit-btn" data-dropdown-key="approvalStatuses" title="Manage statuses">⚙️</button></div>
              <label>Last review<input id="policyRegisterLastReview" type="date"></label>
              <label>Attachment file<input id="policyRegisterFile" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation"></label>
            </div>
            <div id="policyRegisterFilePreview" hidden><span class="eyebrow">Current attachment</span><div class="attachment-item"><span class="attachment-name" id="policyRegisterFileName">-</span><div class="attachment-actions"><button class="attachment-action-button" type="button" id="policyRegisterFileOpen">Open</button><button class="attachment-action-button" type="button" id="policyRegisterFileRemove">Remove</button></div></div></div>
            <label>Notes<textarea id="policyRegisterNotes" rows="4"></textarea></label>
            <div class="policy-items-editor">
              <div class="section-heading compact"><div><p class="eyebrow">POLICY DETAILS</p><h3>Subtitles and content</h3></div><button class="button button-quiet" type="button" id="policyRegisterAddItem">Add detail</button></div>
              <div id="policyRegisterItems" class="policy-items-list"></div>
            </div>
            <div class="csf-form-actions">
              <button class="button button-accent" type="submit" id="policyRegisterSubmit">Save policy</button>
              <button class="button button-danger" id="policyRegisterDelete" type="button" hidden>Delete</button>
              <button class="button button-quiet" type="button" id="policyRegisterCancel">Close</button>
              <span class="save-state" id="policyRegisterFooterStatus">Ready</span>
            </div>
          </form></dialog>
          <dialog id="policyDropdownManagerModal" class="certification-modal"><form id="policyDropdownManagerForm"><div class="policy-dropdown-header"><div><p class="eyebrow">MANAGE DROPDOWN OPTIONS</p><h3 id="policyDropdownManagerTitle">Categories</h3></div></div>
            <div class="policy-dropdown-content"><div id="policyDropdownOptionsList" class="dropdown-options-list"></div><div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><input id="policyDropdownNewOption" type="text" placeholder="Add new option" maxlength="100" style="flex:1;min-width:150px"><button class="button button-accent" type="button" id="policyDropdownAddBtn">Add</button></div></div>
            <div class="policy-dropdown-footer"><button class="button button-quiet" type="button" id="policyDropdownManagerClose">Close</button></div>
          </form></dialog>
          <div class="risk-summary-grid"><article class="insight-panel"><div class="section-heading compact"><div><p class="eyebrow">POLICY STATUS SUMMARY</p><h3>Approval status</h3></div></div><div id="policyStatusSummary" class="risk-summary-list"></div></article><article class="insight-panel"><div class="section-heading compact"><div><p class="eyebrow">REVIEW SCHEDULE</p><h3>Upcoming reviews</h3></div></div><div id="policyReviewSummary" class="risk-summary-list"></div></article><article class="insight-panel"><div class="section-heading compact"><div><p class="eyebrow">POLICY OWNERS</p><h3>Responsible parties</h3></div></div><div id="policyOwnerSummary" class="risk-summary-list"></div></article></div>
          <div class="risk-management-tabs"><button class="button button-accent" type="button" data-policy-tab="register">Policy Register</button><button class="button button-quiet" type="button" data-policy-tab="calendar">Review calendar</button><button class="button button-quiet" id="policySmtpOpen" type="button" data-policy-tab="reminder" hidden>Pengaturan email reminder</button></div>
          <div id="policySmtpPanel" hidden>
            <form id="policySmtpForm" class="smtp-settings">
              <div class="smtp-heading"><p class="eyebrow">EMAIL REMINDER</p><h3>Pengaturan pengingat review</h3><p>Atur jadwal, penerima, dan konten pengingat review kebijakan.</p></div>
              <div class="smtp-card"><p id="policyReminderConnectionStatus" role="status">Memuat status SMTP?</p><button type="button" class="button button-quiet" id="policyOpenGlobalSmtp">Buka pengaturan SMTP terpusat</button></div><div>
                <section class="smtp-card" aria-labelledby="smtpScheduleTitle">
                  <div class="smtp-card-heading"><span class="smtp-step">1</span><div><h4 id="smtpScheduleTitle">Jadwal &amp; penerima</h4><p>Tentukan kapan dan kepada siapa pengingat dikirim.</p></div></div>
                  <label class="smtp-check smtp-enable"><input id="policySmtpEnabled" type="checkbox"><span><strong>Aktifkan reminder otomatis</strong><small>Berlaku setelah pengaturan disimpan.</small></span></label>
                  <div class="smtp-fields">
                    <label class="smtp-wide">Hari sebelum jatuh tempo<input id="policySmtpDays" type="number" min="0" max="365" required value="30"><small>Isi 0 untuk mengingatkan mulai hari jatuh tempo.</small></label>
                    <label class="smtp-wide">Email penerima per owner<textarea id="policySmtpOwners" rows="5" aria-describedby="policySmtpOwnersHelp" placeholder="CISO = nama@example.com&#10;IT Manager = it@example.com"></textarea></label>
                    <div class="smtp-wide" id="policySmtpOwnersHelp">
                      <p><strong>Format: Nama owner = alamat email</strong></p>
                      <p>Gunakan tanda sama dengan (<strong>=</strong>) untuk memisahkan owner dan email. Tekan <strong>Enter</strong> untuk menambahkan owner berikutnya. Jangan gunakan koma atau titik koma.</p>
                      <p style="margin-top:10px">Contoh pengisian:</p>
                      <pre style="margin:8px 0;padding:12px;background:#f3f8f5;border:1px solid var(--line);border-radius:7px;font-size:12px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere">CISO = nama@example.com
IT Manager = it@example.com</pre>
                      <p>Nama owner harus sama persis dengan pilihan <strong>Owner</strong> pada Policy Register. Setiap owner hanya boleh ditulis sekali dengan satu alamat email. Semua kebijakan milik owner tersebut akan menggunakan alamat ini untuk pengingat review. Owner yang belum dicantumkan tidak menerima email reminder.</p>
                    </div>
                  </div>
                  <details class="smtp-note"><summary>Cara kerja jadwal reminder</summary><p>Jatuh tempo dihitung dari Last review + Review cycle: Annual 12 bulan, Biannual 6 bulan, Quarterly 3 bulan. Pemeriksaan setiap jam; pengiriman sekali per kebijakan, jatuh tempo, dan penerima, termasuk review terlambat. Ad hoc, siklus lainnya, dan owner tanpa email dilewati.</p></details>
                </section>
              </div>
              <section class="smtp-card" aria-labelledby="smtpContentTitle">
                <div class="smtp-card-heading"><span class="smtp-step">2</span><div><h4 id="smtpContentTitle">Konten email reminder</h4><p>Edit subjek dan isi email yang akan diterima owner. Pesan dikirim sebagai teks biasa.</p></div></div>
                <div class="smtp-fields">
                  <label class="smtp-wide">Subjek email<input id="policySmtpSubject" required maxlength="200"></label>
                  <label class="smtp-wide">Isi email<textarea id="policySmtpBody" required maxlength="10000" rows="10"></textarea></label>
                  <p class="smtp-wide">Variabel otomatis: <code>{{title}}</code> = judul kebijakan; <code>{{owner}}</code> = owner; <code>{{lastReview}}</code> = tanggal review terakhir; <code>{{reviewCycle}}</code> = siklus review; <code>{{dueDate}}</code> = jatuh tempo. Salin variabel beserta tanda kurungnya ke pesan.</p>
                  <div class="smtp-wide"><h4>Pratinjau dengan data contoh</h4><p>Contoh kebijakan dengan owner CISO, review terakhir 2026-01-15, Annual, jatuh tempo 2027-01-15.</p><strong id="policySmtpPreviewSubject"></strong><pre id="policySmtpPreviewBody" style="white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.7;background:#f3f8f5;padding:16px;border-radius:8px"></pre></div>
                </div>
              </section>
              <div class="smtp-save-bar"><p id="policySmtpSaveHelp">Simpan jadwal, penerima, status, dan konten reminder kebijakan.</p><button class="button button-accent" type="submit" aria-describedby="policySmtpSaveHelp">Simpan reminder kebijakan</button></div>
              <section class="smtp-card smtp-test" aria-labelledby="smtpTestTitle">
                <div class="smtp-card-heading"><span class="smtp-step">3</span><div><h4 id="smtpTestTitle">Uji pengiriman email</h4><p id="policySmtpTestHelp">Simpan perubahan terlebih dahulu. Email percobaan menggunakan konten tersimpan dan data contoh yang sama dengan pratinjau.</p></div></div>
                <div class="smtp-test-controls"><label>Email penerima percobaan<input id="policySmtpTestTo" type="email" placeholder="nama@example.com"></label><button class="button button-quiet" id="policySmtpTest" type="button" aria-describedby="policySmtpTestHelp">Kirim email percobaan</button></div>
              </section>
              <p id="policySmtpStatus" role="status" aria-live="polite"></p>
            </form>
          </div>
          <div id="policyReviewCalendarPanel" hidden>
            <div class="section-heading"><div><p class="eyebrow">REVIEW CALENDAR</p><h3 id="policyReviewCalendarMonthTitle">Policy review calendar</h3></div><div class="calendar-controls"><button class="button button-quiet" type="button" id="policyReviewCalendarPrevious" aria-label="Previous month">&lt;</button><select id="policyReviewCalendarMonthFilter" aria-label="Filter calendar month"><option value="all">All months</option></select><button class="button button-quiet" type="button" id="policyReviewCalendarNext" aria-label="Next month">&gt;</button><button class="button button-accent" type="button" id="policyReviewCalendarToday">Today</button></div></div>
            <div class="policy-calendar" aria-label="Monthly policy review calendar"><div class="policy-calendar-weekdays"><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></div><div id="policyReviewCalendarGrid" class="policy-calendar-grid"></div></div>
            <div class="excel-wrap"><table class="excel-table"><thead><tr><th>Policy title</th><th>Owner</th><th>Review cycle</th><th>Last review</th><th>Next review</th><th>Status</th></tr></thead><tbody id="policyReviewCalendarBody"></tbody></table></div>
          </div>
          <div id="policyRegisterPanel">
            <div class="section-heading"><div><p class="eyebrow">REGISTERED POLICIES</p><h3>Policy register</h3></div><label class="search-box"><span>/</span><input id="policyRegisterSearch" type="search" placeholder="Search policies..." autocomplete="off"></label></div><div class="toolbar"><select id="policyRegisterCategoryFilter" aria-label="Filter policy category"><option value="all">All categories</option></select><select id="policyRegisterStatusFilter" aria-label="Filter approval status"><option value="all">All statuses</option></select><select id="policyRegisterOwnerFilter" aria-label="Filter owner"><option value="all">All owners</option></select><button class="button button-quiet" id="policyRegisterClearFilters" type="button">Clear filters</button><button class="button button-quiet" id="policyRegisterExportButton" type="button">Export data</button></div>
            <div class="excel-wrap"><table class="excel-table"><thead><tr><th>Policy title</th><th>Category</th><th>Owner</th><th>Review cycle</th><th>Approval status</th><th>Last review</th><th>Attachment</th><th>Actions</th></tr></thead><tbody id="policyRegisterBody"></tbody></table></div>
          </div>
        </section>
</template>
