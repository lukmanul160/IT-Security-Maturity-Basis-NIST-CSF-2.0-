/** Child-test bootstrap: no .env; application file paths stay inside fixture root. */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(process.env.NIST_TEST_ROOT || '');
if (!process.env.NIST_TEST_ROOT || path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('nist-regression-')) {
  throw new Error('Isolated test preload requires a verified temporary root.');
}
require('dotenv').config = () => ({ parsed: {} });
const paths = require('../src/config/paths');
const fixture = path.join(root, 'workers', String(process.pid));
for (const key of ['dataRoot', 'uploadRoot', 'backupRoot']) {
  paths[key] = path.join(fixture, key);
  fs.mkdirSync(paths[key], { recursive: true });
}
for (const key of ['stateFile', 'privacyData', 'riskIndicatorsData']) paths[key] = path.join(paths.dataRoot, path.basename(paths[key]));
// Cold PostgreSQL handshakes on this host exceed the application pool's 5s limit.
// Increase only the isolated test pool; production configuration stays unchanged.
require('../src/config/database').pool.options.connectionTimeoutMillis = 30000;
