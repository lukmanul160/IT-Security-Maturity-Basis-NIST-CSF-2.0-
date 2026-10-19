// Child regression processes inherit only the explicitly selected disposable DB.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(process.env.PERF_TEST_ROOT || '.');
if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('nist-module-perf-') ||
    process.env.DB_HOST !== '127.0.0.1' || process.env.DB_NAME !== 'nist_perf_disposable' || !fs.existsSync(path.join(root, 'pg', 'PG_VERSION'))) {
  throw Error('Regression preload requires the owned disposable PostgreSQL cluster');
}
require('dotenv').config = () => ({ parsed: {} });
const paths = require('../src/config/paths');
for (const key of ['dataRoot', 'uploadRoot', 'backupRoot']) paths[key] = path.join(root, key);
for (const key of ['stateFile', 'privacyData', 'riskIndicatorsData']) paths[key] = path.join(paths.dataRoot, path.basename(paths[key]));
