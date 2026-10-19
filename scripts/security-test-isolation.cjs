// Preload before application modules: no .env reads or real PostgreSQL access.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
require('dotenv').config = () => ({ parsed: {} });
const pg = require('pg');
const blocked = () => { throw new Error('SECURITY_TEST: real PostgreSQL access is disabled; use a fixture'); };
pg.Pool.prototype.query = blocked;
pg.Pool.prototype.connect = blocked;
pg.Client.prototype.query = blocked;
pg.Client.prototype.connect = blocked;
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nist-security-'));
const paths = require('../src/config/paths');
for (const key of ['dataRoot', 'uploadRoot', 'backupRoot']) paths[key] = path.join(directory, key);
process.on('exit', () => fs.rmSync(directory, { recursive: true, force: true }));
