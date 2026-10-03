<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<section v-pre id="accountView" class="view">
          <div class="page-heading"><div><p class="eyebrow">ACCOUNT</p><h2>Account Management</h2><p class="lede">Kelola profil dan keamanan akun.</p></div></div>
          <nav class="risk-management-tabs account-management-tabs" aria-label="Account management sections">
            <button class="button button-accent" type="button" data-account-tab="profile" aria-controls="accountProfilePanel" aria-selected="true">1. Account Management</button>
            <span id="accountAdminTabs" style="display:contents">
              <button class="button button-quiet" type="button" data-account-tab="permissions" aria-controls="permissionManagementPanel" aria-selected="false">2. ROLE ACCESS</button>
              <button class="button button-quiet" type="button" data-account-tab="matrix" aria-controls="accountAccessMatrixPanel" aria-selected="false">3. USER ACCESS MATRIX</button>
              <button class="button button-quiet" type="button" data-account-tab="users" aria-controls="accountUsersPanel" aria-selected="false">4. ADMINISTRATION</button>
              <button class="button button-quiet" type="button" data-account-tab="audit" aria-controls="accountAuditPanel" aria-selected="false">5. AUDIT TRAIL</button>
              <button class="button button-quiet" type="button" data-account-tab="smtp" aria-controls="accountSmtpPanel" aria-selected="false">6. Pengaturan SMTP</button>
              <button class="button button-quiet" type="button" data-account-tab="storage" aria-controls="accountStoragePanel" aria-selected="false">7. Storage Setting</button>
            </span>
          </nav>
          <section id="accountProfilePanel" class="account-tab-panel">
            <form id="accountProfileForm" class="tw-surface" style="padding:20px;border:1px solid var(--line);border-radius:8px;margin-bottom:22px">
              <div class="section-heading compact"><div><p class="eyebrow">ACCOUNT MANAGEMENT</p><h3>Kelola profil dan keamanan akun.</h3></div><span class="muted" id="accountProfileStatus">Ready</span></div>
              <div class="csf-form-grid"><label>Username<input id="accountUsername" readonly></label><label id="accountFullNameField">Nama<input id="accountFullName" maxlength="120"></label><label>Password saat ini<input id="accountCurrentPassword" type="password" autocomplete="current-password"></label><label>Password baru<input id="accountNewPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password"></label><label>Konfirmasi password<input id="accountConfirmPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password"></label></div>
              <p class="muted">Password baru harus 8-72 karakter dan mengandung huruf besar, huruf kecil, serta angka.</p><div class="csf-form-actions"><button class="button button-accent" type="submit">Save profile</button></div>
            </form>
          </section>
          <div id="accountAdminPanel" hidden>
          <section id="accountStoragePanel" class="account-tab-panel file-storage-settings" hidden>
            <div class="section-heading compact"><div><p class="eyebrow">STORAGE SETTING</p><h3>Pengaturan penyimpanan upload</h3></div></div>
            <form id="fileStorageForm">
              <p>Pilih lokasi untuk upload evidence dan lampiran kebijakan berikutnya. File yang sudah ada tetap menggunakan lokasi asal; mengganti file juga memakai lokasi asal.</p>
              <fieldset id="fileStorageFields" disabled>
                <label for="fileStorageMode">Lokasi penyimpanan</label>
                <select id="fileStorageMode"><option value="local">Lokal — folder upload aplikasi</option><option value="shared">Storage file — folder jaringan / NAS</option><option value="s3">AWS S3</option><option value="gcs">Google Cloud Storage</option></select>
                <p id="fileStorageLocal" class="muted"></p>
                <div id="fileStorageDirectoryGroup" hidden>
                  <label for="fileStorageDirectory">Path folder storage di server</label>
                  <input id="fileStorageDirectory" type="text" placeholder="Contoh: \\NAS\dokumen\nist atau D:\NistStorage" autocomplete="off">
                  <p class="muted">Gunakan folder khusus yang sudah tersedia. Akun yang menjalankan server harus memiliki izin baca, tulis, dan hapus. Folder ini berada di server/NAS, bukan di komputer browser.</p>
                </div>
                <div id="fileStorageCloudGroup" hidden>
                  <label for="fileStorageBucket">Nama bucket</label>
                  <input id="fileStorageBucket" maxlength="222" placeholder="nist-evidence" autocomplete="off">
                  <label for="fileStoragePrefix">Prefix folder (opsional)</label>
                  <input id="fileStoragePrefix" maxlength="500" placeholder="evidence/production" autocomplete="off">
                  <div id="fileStorageRegionGroup" hidden>
                    <label for="fileStorageRegion">AWS region</label>
                    <input id="fileStorageRegion" maxlength="64" placeholder="ap-southeast-1" autocomplete="off">
                  </div>
                  <div id="fileStorageProjectGroup" hidden>
                    <label for="fileStorageProject">Google Cloud project ID (opsional)</label>
                    <input id="fileStorageProject" maxlength="100" placeholder="my-project" autocomplete="off">
                  </div>
                  <p class="muted">Bucket harus sudah tersedia. Kredensial dikonfigurasi di server: AWS IAM role atau AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY; Google Cloud service account atau GOOGLE_APPLICATION_CREDENTIALS. Akun server membutuhkan izin baca, tulis, dan hapus objek.</p>
                </div>
                <div class="csf-form-actions"><button id="fileStorageTest" class="button button-quiet" type="button">Tes akses storage</button><button id="fileStorageSave" class="button button-accent" type="submit">Simpan pengaturan</button></div>
              </fieldset>
              <p id="fileStorageStatus" role="status" aria-live="polite">Buka tab Storage Setting untuk memuat lokasi penyimpanan.</p>
              <p class="muted">Penyimpanan memerlukan metadata database. Sertakan semua folder file yang digunakan saat melakukan backup.</p>
            </form>
          </section>
            <section id="permissionManagementPanel" class="permission-panel account-tab-panel" hidden>
              <div class="section-heading compact"><div><p class="eyebrow">ROLE ACCESS</p><h3>Pengaturan Hak Akses</h3></div><span class="muted" id="permissionStatus">Configure page access by role</span></div><div class="permission-toolbar"><label>Role<select id="permissionRoleSelect"></select></label><button class="button button-accent" id="permissionSaveButton" type="button">Save permissions</button></div><div><div class="permission-edit-panel"><div class="permission-section-label"><strong>Selected role access</strong><span>Page access for the chosen role</span></div><div id="permissionChecks" class="permission-checks"></div></div></div>
            </section>
            <section id="accountAccessMatrixPanel" class="permission-panel account-tab-panel" hidden><div class="section-heading compact"><div><p class="eyebrow">USER ACCESS MATRIX</p><h3>Ringkasan hak akses semua role</h3><p class="muted">Lihat izin Read/View, Tambah, Edit, dan Delete. Ubah izin melalui tab Role Access.</p></div></div><div class="permission-matrix-panel"><div class="permission-section-label"><strong>User access matrix</strong><span>Overview of all role permissions</span></div><div id="permissionMatrix" class="permission-matrix-wrap"></div></div></section>
            <section id="accountUsersPanel" class="account-tab-panel" hidden>
              <form id="accountUserForm" class="tw-surface" style="padding:20px;border:1px solid var(--line);border-radius:8px;margin-bottom:22px"><div class="section-heading compact"><div><p class="eyebrow">ADMINISTRATION</p><h3 id="accountUserFormTitle">Create user</h3></div><span class="muted" id="accountUserStatus">Ready</span></div><input id="accountUserId" type="hidden"><div class="csf-form-grid"><label>Username<input id="accountUserUsername" required maxlength="50"></label><label>Nama<input id="accountUserFullName" maxlength="120"></label><label>Password<input id="accountUserPassword" type="password" minlength="8" maxlength="72"></label><label>Role<select id="accountUserRole"><option value="viewer">viewer</option><option value="editor">editor</option><option value="approver">approver</option><option value="user">user</option><option value="admin">admin</option></select></label></div><div class="csf-form-actions"><button class="button button-accent" type="submit">Save user</button><button class="button button-quiet" id="accountUserCancel" type="button">Clear form</button></div></form>
              <div class="excel-wrap"><table class="excel-table"><thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Actions</th></tr></thead><tbody id="accountUsersBody"></tbody></table><div class="assessment-pagination" id="accountUsersPagination"></div></div>
            </section>
            <section id="accountSmtpPanel" class="account-tab-panel" hidden><form id="globalSmtpForm" class="smtp-settings"><div class="smtp-heading"><p class="eyebrow">EMAIL ORGANISASI</p><h3>Pengaturan SMTP terpusat</h3><p>Koneksi email bersama untuk seluruh fitur reminder. Jadwal, penerima, dan konten pesan diatur di modul masing-masing.</p></div>                <section class="smtp-card" aria-labelledby="globalSmtpConnectionTitle">
                  <div class="smtp-card-heading"><span class="smtp-step">1</span><div><h4 id="globalSmtpConnectionTitle">Koneksi SMTP</h4><p>Gunakan konfigurasi dari penyedia email Anda.</p></div></div>
                  <div class="smtp-fields">
                    <label class="smtp-wide">SMTP host<input id="globalSmtpHost" maxlength="254" placeholder="smtp.example.com"></label>
                    <label>Port<input id="globalSmtpPort" type="number" min="1" max="65535" required value="587"></label>
                    <label>Keamanan<select id="globalSmtpSecurity"><option value="starttls">STARTTLS (587)</option><option value="tls">TLS (465)</option></select></label>
                    <label class="smtp-wide">Email pengirim<input id="globalSmtpFrom" type="email" maxlength="254" placeholder="reminder@example.com"></label>
                    <label class="smtp-wide">Username<input id="globalSmtpUsername" maxlength="254" autocomplete="off" placeholder="Username SMTP"></label>
                    <label class="smtp-wide">Password<input id="globalSmtpPassword" type="password" autocomplete="new-password" placeholder="Masukkan password SMTP"><small>Kosongkan untuk mempertahankan password tersimpan.</small></label>
                  </div>
                  <label class="smtp-check"><input id="globalSmtpClearPassword" type="checkbox"><span>Hapus password SMTP saat menyimpan</span></label>
                </section>
<div class="smtp-save-bar"><p>Kosongkan password untuk mempertahankan kredensial yang tersimpan.</p><button class="button button-accent" type="submit">Simpan SMTP</button></div><section class="smtp-card"><h4>Uji koneksi email</h4><p>Simpan perubahan sebelum mengirim email percobaan.</p><div class="smtp-test-controls"><label>Email tujuan<input id="globalSmtpTestTo" type="email" placeholder="nama@example.com"></label><button type="button" class="button button-quiet" id="globalSmtpTest">Kirim email percobaan</button></div></section><p id="globalSmtpStatus" role="status" aria-live="polite"></p><button type="button" class="button button-quiet" id="globalSmtpPolicyReminder">Buka reminder Policy Register</button></form></section>
            <section id="accountAuditPanel" class="permission-panel account-tab-panel" hidden><div class="section-heading compact"><div><p class="eyebrow">AUDIT TRAIL</p><h3>Aktivitas aplikasi</h3></div><button class="button button-quiet" id="auditRefreshButton" type="button">Refresh</button></div><div class="toolbar"><select id="auditEventFilter"><option value="">All events</option><option value="data.mutation">Data mutation</option><option value="request.error">Errors</option><option value="request">Requests</option></select></div><div class="excel-wrap"><table class="excel-table"><thead><tr><th>Waktu</th><th>Actor</th><th>Event</th><th>Method</th><th>Path</th><th>Status</th><th>Request ID</th></tr></thead><tbody id="auditBody"></tbody></table><div class="assessment-pagination" id="auditPagination"></div></div></section>
          </div>
        </section>
</template>

<style>
#accountStoragePanel {
  max-width: 1040px;
  padding: clamp(20px, 3vw, 32px);
  background: #fff;
  border: 1px solid var(--line, #dbe3ec);
  border-radius: 18px;
  box-shadow: 0 8px 28px rgb(15 35 60 / 5%);
}
#accountStoragePanel .section-heading { margin-bottom: 20px; }
#accountStoragePanel h3 { margin: 6px 0 0; font-size: 22px; line-height: 1.35; }
#fileStorageForm { display: grid; gap: 20px; }
#fileStorageForm p { margin: 0; line-height: 1.7; overflow-wrap: anywhere; }
#fileStorageForm > p:first-child { max-width: 78ch; color: var(--muted, #64748b); font-size: 14px; }
#fileStorageFields {
  display: grid;
  gap: 12px;
  min-width: 0;
  margin: 0;
  padding: 24px;
  border: 1px solid #e3eaf2;
  border-radius: 12px;
  background: #f8fafc;
}
#fileStorageFields label { display: block; font-size: 13px; font-weight: 600; color: var(--navy, #18324d); }
#fileStorageFields input, #fileStorageFields select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 46px;
  padding: 11px 14px;
  background: #fff;
  border: 1px solid #cfd9e5;
  border-radius: 9px;
  color: var(--ink, #1e293b);
  font: inherit;
  font-size: 14px;
  transition: border-color .15s, box-shadow .15s;
}
#fileStorageFields input::placeholder { color: #8492a6; }
#fileStorageFields input:focus-visible, #fileStorageFields select:focus-visible {
  border-color: #477db3;
  outline: 2px solid #477db3;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgb(71 125 179 / 10%);
}
#fileStorageDirectoryGroup:not([hidden]), #fileStorageCloudGroup:not([hidden]),
#fileStorageRegionGroup:not([hidden]), #fileStorageProjectGroup:not([hidden]) { display: grid; gap: 10px; }
#fileStorageDirectoryGroup, #fileStorageCloudGroup { margin-top: 8px; padding-top: 20px; border-top: 1px solid #e3eaf2; }
#fileStorageForm .muted { color: var(--muted, #64748b); font-size: 12px; }
#fileStorageLocal { padding: 10px 14px; border-radius: 8px; background: #eef3f8; }
#fileStorageFields .csf-form-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 12px; margin-top: 12px; padding-top: 20px; border-top: 1px solid #e3eaf2; }
#fileStorageFields .button { min-height: 44px; padding: 11px 18px; border-radius: 9px; }
#fileStorageTest { background: #fff; border: 1px solid #cfd9e5; }
#fileStorageFields:disabled { opacity: .65; }
#fileStorageStatus:not(:empty) { padding: 12px 16px; border: 1px solid #dce7f2; border-radius: 9px; background: #f0f6fc; color: #365b80; font-size: 13px; }
@media (max-width: 600px) {
  #accountStoragePanel { padding: 18px; border-radius: 12px; }
  #accountStoragePanel h3 { font-size: 20px; }
  #fileStorageFields { padding: 16px; }
  #fileStorageFields .csf-form-actions { flex-direction: column; }
  #fileStorageFields .button { width: 100%; }
}
</style>
