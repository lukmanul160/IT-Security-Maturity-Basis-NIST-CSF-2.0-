<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<section v-pre id="accountView" class="view">
          <div class="page-heading"><div><p class="eyebrow">ACCOUNT</p><h2>Account Management</h2><p class="lede">Kelola profil dan keamanan akun.</p></div></div>
          <nav class="risk-management-tabs account-management-tabs" aria-label="Account management sections">
            <button class="button button-accent" type="button" data-account-tab="profile" aria-controls="accountProfilePanel" aria-selected="true">1. Account Management</button>
            <span id="accountAdminTabs" style="display:contents">
              <button class="button button-quiet" type="button" data-account-tab="permissions" aria-controls="permissionManagementPanel" aria-selected="false">2. ROLE ACCESS</button>
              <button class="button button-quiet" type="button" data-account-tab="users" aria-controls="accountUsersPanel" aria-selected="false">3. ADMINISTRATION</button>
              <button class="button button-quiet" type="button" data-account-tab="audit" aria-controls="accountAuditPanel" aria-selected="false">4. AUDIT TRAIL</button>
              <button class="button button-quiet" type="button" data-account-tab="smtp" aria-controls="accountSmtpPanel" aria-selected="false">5. Pengaturan SMTP</button>
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
            <section id="permissionManagementPanel" class="permission-panel account-tab-panel" hidden>
              <div class="section-heading compact"><div><p class="eyebrow">ROLE ACCESS</p><h3>Pengaturan Hak Akses</h3></div><span class="muted" id="permissionStatus">Configure page access by role</span></div><div class="permission-toolbar"><label>Role<select id="permissionRoleSelect"></select></label><button class="button button-accent" id="permissionSaveButton" type="button">Save permissions</button></div><div class="permission-layout"><div class="permission-edit-panel"><div class="permission-section-label"><strong>Selected role access</strong><span>Page access for the chosen role</span></div><div id="permissionChecks" class="permission-checks"></div></div><div class="permission-matrix-panel"><div class="permission-section-label"><strong>User access matrix</strong><span>Overview of all role permissions</span></div><div id="permissionMatrix" class="permission-matrix-wrap"></div></div></div>
            </section>
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
