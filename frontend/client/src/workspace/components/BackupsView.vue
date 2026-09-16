<!-- Static DOM retained for existing feature runtime. Keep IDs and classes stable. -->
<template>
<section v-pre id="backupsView" class="view backup-page">
          <div class="page-heading backup-page-heading"><div><p class="eyebrow">DATABASE ADMINISTRATION</p><h2>Database Backup</h2><p class="lede">Buat, unduh, dan restore backup database PostgreSQL.</p></div><div class="csf-actions backup-primary-action"><button class="button button-accent" id="backupCreateButton" type="button">Create backup</button><span class="file-count" id="backupCount">0 backups</span></div></div>
          <div class="backup-restore-panel"><div><p class="eyebrow">RECOVERY CONTROL</p><h3>Restore database</h3><p class="muted">Restore mengganti data database saat ini. Gunakan file backup yang dibuat aplikasi ini.</p></div><div class="backup-restore-actions"><label class="button button-quiet" for="backupRestoreInput">Select backup file<input id="backupRestoreInput" type="file" accept=".dump,.json" hidden></label><span class="muted" id="backupRestoreFileName">No file selected</span><button class="button button-danger" id="backupRestoreButton" type="button" disabled>Restore selected backup</button></div></div>
          <div class="section-heading backup-archive-heading"><div><p class="eyebrow">BACKUP ARCHIVE</p><h3>Available database backups</h3><p class="muted" id="backupStatus">Backup hanya dapat diakses administrator.</p></div></div>
          <div class="excel-wrap backup-archive-table"><table class="excel-table"><thead><tr><th>File</th><th>Created</th><th>Size</th><th>Actions</th></tr></thead><tbody id="backupBody"></tbody></table></div>
        </section>
</template>
