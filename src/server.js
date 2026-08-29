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

async function start() {
  await provisionDatabase();
  await ensureUploadRoot();
  await initializeAssessmentStore();
  await initializeFrameworks();
  await ensureRiskAcceptanceStore();
  await ensureRiskManagementStore();
  await ensurePersonnelCertificationStore();
  await ensureCertificationRoadmapCatalogStore();
  await ensurePermissionStore();
  await ensureTprmStore();
  await ensureTprmQuestionnaireStore();
  await ensureQuestionnaireTemplateStore();
  await pool.query(await fs.readFile(usersFile, 'utf8'));
  app.listen(port, () => console.log(`NIST CSF Express server: http://localhost:${port}`));
}

start().catch(error => { console.error(error); process.exitCode = 1; });