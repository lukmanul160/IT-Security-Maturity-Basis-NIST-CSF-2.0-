const app = require('./app');
const { port } = require('./config/env');
const { ensureUploadRoot } = require('./services/fileService');
const { initializeAssessmentStore } = require('./services/assessmentService');
const { initializeFrameworks } = require('./services/frameworkService');
const fs = require('fs').promises;
const { usersFile } = require('./config/paths');
const { pool } = require('./config/database');
const { ensureStore: ensureRiskAcceptanceStore } = require('./services/riskAcceptanceService');

async function start() {
  await ensureUploadRoot();
  await initializeAssessmentStore();
  await initializeFrameworks();
  await ensureRiskAcceptanceStore();
  await pool.query(await fs.readFile(usersFile, 'utf8'));
  app.listen(port, () => console.log(`NIST CSF Express server: http://localhost:${port}`));
}

start().catch(error => { console.error(error); process.exitCode = 1; });