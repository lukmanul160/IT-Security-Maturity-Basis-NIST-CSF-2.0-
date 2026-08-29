const { Client } = require('pg');

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nist_basis',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS questionnaire_templates (
      id BIGSERIAL PRIMARY KEY,
      template_name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      sections JSONB NOT NULL DEFAULT '[]'::jsonb,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS tprm_due_diligence_questionnaires (
      id BIGSERIAL PRIMARY KEY,
      vendor_name TEXT NOT NULL,
      assessment_status TEXT NOT NULL DEFAULT 'Draft',
      review_date DATE,
      assessment_result TEXT NOT NULL DEFAULT 'Pending',
      reviewer TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      responses JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    ALTER TABLE tprm_due_diligence_questionnaires
    ADD COLUMN IF NOT EXISTS template_id BIGINT;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS questionnaire_templates_default_idx
    ON questionnaire_templates (is_default);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS tprm_questionnaires_updated_idx
    ON tprm_due_diligence_questionnaires (updated_at DESC);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS tprm_questionnaires_template_idx
    ON tprm_due_diligence_questionnaires (template_id);
  `);

  const result = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'tprm_due_diligence_questionnaires'
      AND column_name = 'template_id';
  `);

  const count = await client.query('SELECT COUNT(*) AS total FROM questionnaire_templates');
  console.log('template_id exists:', result.rowCount > 0);
  console.log('template rows:', count.rows[0].total);

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
