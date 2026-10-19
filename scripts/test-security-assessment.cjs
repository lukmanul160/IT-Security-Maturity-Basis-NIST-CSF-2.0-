const { spawnSync } = require('node:child_process');
const path = require('node:path');
const tests = [
  'securityAssessment', 'defaultAccountSeed', 'createAdmin', 'securityHardening',
  'owaspRemediation', 'sessionCookieConfig', 'virtualOffice', 'statements',
  'statementRateLimit', 'statementDocuments', 'statementEmployees', 'storageService',
  'knowledgeNotes', 'backupService', 'fileBackupService', 'databaseBackupParts',
  'roleActionPermissions', 'personnelAuthorization', 'evidenceAccessService',
  'submissionGuard', 'auditTrail', 'fileLimits', 'databaseIntegrityHardening',
  'personnelCertificateFiles', 'noteImport', 'noteImages', 'policyDocument',
  'largeDatabaseBackup',
];
const result = spawnSync(process.execPath, [
  '--require', './scripts/security-test-isolation.cjs', '--test', '--test-reporter=tap',
  ...tests.map(name => `test/${name}.test.js`),
], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit', shell: false });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
