const app = require('./app');
const { port } = require('./config/env');
const { ensureUploadRoot } = require('./services/fileService');
const { initializeAssessmentStore } = require('./services/assessmentService');
const { initialize: initializeCsfStore } = require('./services/csfService');
const fs = require('fs').promises;
const { usersFile } = require('./config/paths');
const { pool } = require('./config/database');

async function start() {
  await ensureUploadRoot();
  await initializeAssessmentStore();
  await initializeCsfStore();
  await pool.query(await fs.readFile(usersFile, 'utf8'));
  app.listen(port, () => console.log(`NIST CSF Express server: http://localhost:${port}`));
}

start().catch(error => { console.error(error); process.exitCode = 1; });