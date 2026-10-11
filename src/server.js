/* Copyright (c) 2026 Lukmanul Hakim (lukmanul160@gmail.com). */
const app = require('./app');
const { port } = require('./config/env');
const { ensureUploadRoot } = require('./services/fileService');
const { initializeAssessmentStore } = require('./services/assessmentService');
const { initializeFrameworks } = require('./services/frameworkService');
const fs = require('fs').promises;
const { usersFile } = require('./config/paths');
const { pool } = require('./config/database');
const { provisionDatabase } = require('../scripts/provision-db');
const { ensureStore: ensureRiskAcceptanceStore } = require('./services/riskAcceptanceService');
const { ensureStore: ensureRiskManagementStore } = require('./services/riskManagementService');
const { ensureStore: ensurePersonnelCertificationStore } = require('./services/personnelCertificationService');
const { ensureStore: ensureCertificationRoadmapCatalogStore } = require('./services/certificationRoadmapCatalogService');
const { ensureStore: ensurePermissionStore } = require('./services/permissionService');
const { ensureStore: ensureTprmStore } = require('./services/tprmService');
const { ensureStore: ensureTprmQuestionnaireStore } = require('./services/tprmQuestionnaireService');
const { ensureStore: ensureQuestionnaireTemplateStore } = require('./services/questionnaireTemplateService');
const { ensureStore: ensurePolicyRegisterStore } = require('./services/policyRegisterService');
const { ensureStore: ensureAuditStore } = require('./services/auditService');
const { ensureBackupRoot } = require('./services/backupService');

async function start() {
  await provisionDatabase();
  await ensureUploadRoot();
  await initializeAssessmentStore();
  await pool.query(await fs.readFile(require('path').join(__dirname, '../database/evidence-ownership.sql'), 'utf8'));
  await require('./services/storageService').ensureStore();
  await initializeFrameworks();
  await require('./services/assessmentGapService').ensureStore();
  await ensureRiskAcceptanceStore();
  await ensureRiskManagementStore();
  await ensurePersonnelCertificationStore();
  await ensureCertificationRoadmapCatalogStore();
  await ensurePermissionStore();
  await require('./services/assetManagementService').ensureStore();
  await require('./services/assetReminderSettingsService').ensureStore();
  await require('./services/assetDiagramService').ensureStore();
  await require('./services/assetRackPhotoService').ensureStore();
  await require('./services/threatModelService').ensureStore();
  await require('./services/knowledgeNoteService').ensureStore();
  await ensureTprmStore();
  await ensureTprmQuestionnaireStore();
  await ensureQuestionnaireTemplateStore();
  await ensurePolicyRegisterStore();
  await require('./services/policyReminderService').ensureStore();
  await ensureAuditStore();
  require('./middleware/audit').startAuditRecovery();
  await require('./services/auditFindingService').ensureStore();
  await require('./services/auditFindingReminderService').ensureStore();
  await ensureBackupRoot();
  await pool.query(await fs.readFile(usersFile, 'utf8'));
  await new Promise((resolve, reject) => {
    app.listen(port, error => {
      if (error) return reject(error);
      console.log(`NIST CSF Express server: http://localhost:${port}`);
      resolve();
    });
  });
  require('./services/assetManagementService').startScheduler();
  require('./services/policyReminderService').startScheduler();
  require('./services/auditFindingReminderService').startScheduler();
}

start().catch(async error => {
  process.exitCode = 1;
  if (error.code === 'EADDRINUSE') {
    console.error(`Gagal menjalankan server: port ${port} sudah digunakan. Hentikan server lama atau gunakan PORT lain di .env.`);
  } else {
    console.error(error);
  }
  await pool.end();
});
