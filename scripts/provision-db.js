require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');

const databaseName = process.env.DB_NAME || 'nist_basis';
const baseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
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

  const client = new Client({ ...baseConfig, database: databaseName });
  await client.connect();

  await client.query(fs.readFileSync('database/schema.sql', 'utf8'));
  await client.query(fs.readFileSync('database/users.sql', 'utf8'));
  await client.query("ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check");
  await client.query("ALTER TABLE app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'approver', 'editor', 'viewer', 'user'))");

  const templateIdExists = await client.query(
    "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'tprm_due_diligence_questionnaires' AND column_name = 'template_id') AS exists"
  );

  if (!templateIdExists.rows[0].exists) {
    await client.query('ALTER TABLE tprm_due_diligence_questionnaires ADD COLUMN IF NOT EXISTS template_id BIGINT');
    await client.query('CREATE INDEX IF NOT EXISTS tprm_questionnaires_template_idx ON tprm_due_diligence_questionnaires (template_id)');
    console.log('Migration: Added template_id column to tprm_due_diligence_questionnaires');
  }

  const questionnaireIdExists = await client.query(
    "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name = 'tprm_risk_register' AND column_name = 'questionnaire_id') AS exists"
  );

  if (!questionnaireIdExists.rows[0].exists) {
    await client.query('ALTER TABLE tprm_risk_register ADD COLUMN IF NOT EXISTS questionnaire_id BIGINT');
    await client.query('ALTER TABLE tprm_risk_register ADD CONSTRAINT tprm_risk_register_questionnaire_fk FOREIGN KEY (questionnaire_id) REFERENCES tprm_due_diligence_questionnaires(id) ON DELETE SET NULL');
    console.log('Migration: Added questionnaire_id relation to tprm_risk_register');
  }

  const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('assessment_state', 'evidence_files', 'app_users') ORDER BY tablename");
  console.log(`Tables ready: ${tables.rows.map(row => row.tablename).join(', ')}`);
  await client.end();
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
