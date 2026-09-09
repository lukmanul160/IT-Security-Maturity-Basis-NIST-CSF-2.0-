<script setup>
import { ref } from 'vue';
import BaseTabs from './BaseTabs.vue';

const activeTab = ref('profile');
const tabs = [
  { value: 'profile', label: '1. Account Management', panel: 'accountProfilePanel' },
  { value: 'permissions', label: '2. ROLE ACCESS', panel: 'permissionManagementPanel' },
  { value: 'users', label: '3. ADMINISTRATION', panel: 'accountUsersPanel' },
  { value: 'audit', label: '4. AUDIT TRAIL', panel: 'accountAuditPanel' },
];
</script>

<template>
  <div class="account-management-component">
    <div class="page-heading"><div><p class="eyebrow">ACCOUNT</p><h2>Account Management</h2><p class="lede">Kelola profil dan keamanan akun.</p></div></div>
    <BaseTabs v-model="activeTab" :items="tabs" />

    <section id="accountProfilePanel" class="account-tab-panel" :hidden="activeTab !== 'profile'">
      <form id="accountProfileForm" class="tw-surface" style="padding:20px;border:1px solid var(--line);border-radius:8px;margin-bottom:22px">
        <div class="section-heading compact"><div><p class="eyebrow">ACCOUNT MANAGEMENT</p><h3>Kelola profil dan keamanan akun.</h3></div><span class="muted" id="accountProfileStatus">Ready</span></div>
        <div class="csf-form-grid"><label>Username<input id="accountUsername" readonly></label><label id="accountFullNameField">Nama<input id="accountFullName" maxlength="120"></label><label>Password saat ini<input id="accountCurrentPassword" type="password" autocomplete="current-password"></label><label>Password baru<input id="accountNewPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password"></label><label>Konfirmasi password<input id="accountConfirmPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password"></label></div>
        <p class="muted">Password baru harus 8-72 karakter dan mengandung huruf besar, huruf kecil, serta angka.</p><div class="csf-form-actions"><button class="button button-accent" type="submit">Save profile</button></div>
      </form>
    </section>

    <div id="accountAdminPanel">
      <section id="permissionManagementPanel" class="permission-panel account-tab-panel" :hidden="activeTab !== 'permissions'">
        <div class="section-heading compact"><div><p class="eyebrow">ROLE ACCESS</p><h3>Pengaturan Hak Akses</h3></div><span class="muted" id="permissionStatus">Configure page access by role</span></div><div class="permission-toolbar"><label>Role<select id="permissionRoleSelect"></select></label><button class="button button-accent" id="permissionSaveButton" type="button">Save permissions</button></div><div class="permission-layout"><div class="permission-edit-panel"><div class="permission-section-label"><strong>Selected role access</strong><span>Page access for the chosen role</span></div><div id="permissionChecks" class="permission-checks"></div></div><div class="permission-matrix-panel"><div class="permission-section-label"><strong>User access matrix</strong><span>Overview of all role permissions</span></div><div id="permissionMatrix" class="permission-matrix-wrap"></div></div></div>
      </section>
      <section id="accountUsersPanel" class="account-tab-panel" :hidden="activeTab !== 'users'">
        <form id="accountUserForm" class="tw-surface" style="padding:20px;border:1px solid var(--line);border-radius:8px;margin-bottom:22px"><div class="section-heading compact"><div><p class="eyebrow">ADMINISTRATION</p><h3 id="accountUserFormTitle">Create user</h3></div><span class="muted" id="accountUserStatus">Ready</span></div><input id="accountUserId" type="hidden"><div class="csf-form-grid"><label>Username<input id="accountUserUsername" required maxlength="50"></label><label>Nama<input id="accountUserFullName" maxlength="120"></label><label>Password<input id="accountUserPassword" type="password" minlength="8" maxlength="72"></label><label>Role<select id="accountUserRole"><option value="viewer">viewer</option><option value="editor">editor</option><option value="approver">approver</option><option value="user">user</option><option value="admin">admin</option></select></label></div><div class="csf-form-actions"><button class="button button-accent" type="submit">Save user</button><button class="button button-quiet" id="accountUserCancel" type="button">Clear form</button></div></form>
        <div class="excel-wrap"><table class="excel-table"><thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Actions</th></tr></thead><tbody id="accountUsersBody"></tbody></table><div class="assessment-pagination" id="accountUsersPagination"></div></div>
      </section>
      <section id="accountAuditPanel" class="permission-panel account-tab-panel" :hidden="activeTab !== 'audit'"><div class="section-heading compact"><div><p class="eyebrow">AUDIT TRAIL</p><h3>Aktivitas aplikasi</h3></div><button class="button button-quiet" id="auditRefreshButton" type="button">Refresh</button></div><div class="toolbar"><select id="auditEventFilter"><option value="">All events</option><option value="data.mutation">Data mutation</option><option value="request.error">Errors</option><option value="request">Requests</option></select></div><div class="excel-wrap"><table class="excel-table"><thead><tr><th>Waktu</th><th>Actor</th><th>Event</th><th>Method</th><th>Path</th><th>Status</th><th>Request ID</th></tr></thead><tbody id="auditBody"></tbody></table><div class="assessment-pagination" id="auditPagination"></div></div></section>
    </div>
  </div>
</template>
