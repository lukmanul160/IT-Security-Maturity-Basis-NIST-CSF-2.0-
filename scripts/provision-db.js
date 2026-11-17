require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');

const databaseName = process.env.DB_NAME || 'nist_basis';
const baseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false', ...(process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}) } : false,
};

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function provisionDatabase() {
  const admin = new Client({ ...baseConfig, database: 'postgres' });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
  if (!exists.rowCount) {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    console.log(`Database created: ${databaseName}`);
  } else {
    console.log(`Database exists: ${databaseName}`);
  }
  await admin.end();

  await require('../src/services/migrationService').ensureSchema();
  await require('../src/config/database').pool.query(fs.readFileSync(require('../src/config/paths').usersFile, 'utf8'));
  const { ensureStore } = require('../src/services/personnelCertificationService');
  await ensureStore();
  const { ensureStore: ensureRoadmapCatalogStore } = require('../src/services/certificationRoadmapCatalogService');
  await ensureRoadmapCatalogStore();
  console.log('Personnel Certification and roadmap catalog seed ready.');
  return true;
}

if (require.main === module) {
  provisionDatabase().catch(error => {
    console.error(`Database provisioning failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { provisionDatabase };
