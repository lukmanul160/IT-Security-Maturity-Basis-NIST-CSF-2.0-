const fs = require('fs').promises;
const { stateFile, schemaFile } = require('../config/paths');
const { pool } = require('../config/database');

const emptyState = { scores: {}, policyScores: {}, practiceScores: {}, notes: {}, attachments: {} };

async function getAssessment() {
  const result = await pool.query('SELECT data FROM assessment_state WHERE id = $1', ['default']);
  return result.rows[0]?.data || emptyState;
}

async function saveAssessment(assessment) {
  const result = await pool.query(`
    INSERT INTO assessment_state (id, data, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    RETURNING data
  `, ['default', JSON.stringify(assessment)]);
  return result.rows[0].data;
}

async function initializeAssessmentStore() {
  await pool.query(await fs.readFile(schemaFile, 'utf8'));
  const existing = await pool.query('SELECT 1 FROM assessment_state WHERE id = $1', ['default']);
  if (existing.rowCount) return;
  try {
    const legacy = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    await saveAssessment(legacy);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await saveAssessment(emptyState);
  }
}

module.exports = { emptyState, getAssessment, saveAssessment, initializeAssessmentStore };
