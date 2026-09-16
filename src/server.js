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
  await require('./services/storageService').ensureStore();
  await initializeFrameworks();
  await ensureRiskAcceptanceStore();
  await ensureRiskManagementStore();
  await ensurePersonnelCertificationStore();
  await ensureCertificationRoadmapCatalogStore();
  await ensurePermissionStore();
  await ensureTprmStore();
  await ensureTprmQuestionnaireStore();
  await ensureQuestionnaireTemplateStore();
  await ensurePolicyRegisterStore();
  await require('./services/policyReminderService').ensureStore();
  await ensureAuditStore();
  await require('./services/auditFindingService').ensureStore();
  await require('./services/auditFindingReminderService').ensureStore();
  await ensureBackupRoot();
  await pool.query(await fs.readFile(usersFile, 'utf8'));
  app.listen(port, () => console.log(`NIST CSF Express server: http://localhost:${port}`));
  require('./services/policyReminderService').startScheduler();
  require('./services/auditFindingReminderService').startScheduler();
}

start().catch(error => { console.error(error); process.exitCode = 1; });
