const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/database');
const { dataRoot, privacyData, uploadRoot } = require('../config/paths');

function duplicateIdError(frameworkId, code) {
  const label = frameworkId === 'csf' ? 'CSF' : frameworkId === 'privacy' ? 'Privacy' : frameworkId === 'iso27001' ? 'ISO 27001' : frameworkId;
  return Object.assign(new Error(`${label} control ID already exists: ${code}`), { status: 409 });
}

async function ensureFramework(framework) {
  const result = await pool.query('SELECT id FROM frameworks WHERE id = $1', [framework.id]);
  if (!result.rowCount) {
    await pool.query('INSERT INTO frameworks (id, name, version, description) VALUES ($1, $2, $3, $4)', [framework.id, framework.name, framework.version, framework.description || '']);
  }
}

async function listFrameworks() {
  const result = await pool.query('SELECT id, name, version, description FROM frameworks ORDER BY name');
  return result.rows;
}

async function createFramework(data) {
  if (!data || typeof data.id !== 'string' || !data.id.trim() || typeof data.name !== 'string' || !data.name.trim() || typeof data.version !== 'string' || !data.version.trim()) throw Object.assign(new Error('Framework id, name, and version are required'), { status: 400 });
  const result = await pool.query('INSERT INTO frameworks (id, name, version, description) VALUES ($1, $2, $3, $4) RETURNING id, name, version, description', [data.id.trim(), data.name.trim(), data.version.trim(), typeof data.description === 'string' ? data.description : '']);
  return result.rows[0];
}

async function getControls(frameworkId) {
  const orderBy = frameworkId === 'iso27001' ? "string_to_array(code, '.')::int[] ASC" : frameworkId === 'iso27001-soa' ? "string_to_array(regexp_replace(code, '^A\\.', ''), '.')::int[] ASC" : 'code';
  const result = await pool.query(`SELECT code AS id, function, category, subcategory, implementation, "references", minimum_evidence AS "minimumEvidence", evidence, applicability FROM controls WHERE framework_id = $1 ORDER BY ${orderBy}`, [frameworkId]);
  if (frameworkId === 'iso27001') {
    const seed = JSON.parse(await fs.readFile(`${dataRoot}/iso-27001-data.json`, 'utf8'));
    const seedByCode = new Map(seed.map(row => [row.id, row.minimumEvidence || '']));
    return result.rows.map(row => ({ ...row, minimumEvidence: row.minimumEvidence || seedByCode.get(row.id) || '' }));
  }
  return result.rows;
}

async function createControl(frameworkId, data) {
  const existing = await pool.query('SELECT 1 FROM controls WHERE framework_id = $1 AND code = $2', [frameworkId, data.id]);
  if (existing.rowCount) throw duplicateIdError(frameworkId, data.id);
  const evidence = Array.isArray(data.evidence) ? data.evidence : [];
  const applicability = ['Applicable', 'Not applicable'].includes(data.applicability) ? data.applicability : 'Applicable';
  const result = await pool.query('INSERT INTO controls (framework_id, code, function, category, subcategory, implementation, "references", minimum_evidence, evidence, applicability) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING code AS id, function, category, subcategory, implementation, "references", minimum_evidence AS "minimumEvidence", evidence, applicability', [frameworkId, data.id, data.function, data.category, data.subcategory, data.implementation || '', data.references || '', data.minimumEvidence || '', JSON.stringify(evidence), applicability]);
  return result.rows[0];
}

async function updateControl(frameworkId, code, data) {
  const fields = ['function', 'category', 'subcategory', 'implementation', '"references"', 'minimum_evidence', 'evidence', 'applicability'].filter(field => data[field.replaceAll('"', '')] !== undefined);
  if (!fields.length) throw Object.assign(new Error('No fields to update'), { status: 400 });
  const params = fields.map(field => field === 'evidence' ? JSON.stringify(Array.isArray(data.evidence) ? data.evidence : []) : field === 'applicability' && !['Applicable', 'Not applicable'].includes(data.applicability) ? 'Applicable' : data[field.replaceAll('"', '')]);
  const assignments = fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
  params.push(frameworkId, code);
  const result = await pool.query(`UPDATE controls SET ${assignments}, updated_at = NOW() WHERE framework_id = $${params.length - 1} AND code = $${params.length} RETURNING code AS id, function, category, subcategory, implementation, "references", minimum_evidence AS "minimumEvidence", evidence, applicability`, params);
  if (!result.rowCount) throw Object.assign(new Error('Control not found'), { status: 404 });
  return result.rows[0];
}

async function updateControlEvidence(frameworkId, code, evidence) {
  const result = await pool.query(
    'UPDATE controls SET evidence = $1, updated_at = NOW() WHERE framework_id = $2 AND code = $3 RETURNING code AS id, evidence',
    [JSON.stringify(Array.isArray(evidence) ? evidence : []), frameworkId, code]
  );
  if (!result.rowCount) throw Object.assign(new Error('Control not found'), { status: 404 });
  return result.rows[0];
}

async function deleteControl(frameworkId, code) {
  const result = await pool.query('DELETE FROM controls WHERE framework_id = $1 AND code = $2', [frameworkId, code]);
  if (!result.rowCount) throw Object.assign(new Error('Control not found'), { status: 404 });
}

async function listCategoryTargets(frameworkId) {
  await pool.query(`
    INSERT INTO framework_category_targets (framework_id, category, target_score)
    SELECT framework_id, category, 3.0
    FROM controls
    WHERE framework_id = $1
    GROUP BY framework_id, category
    ON CONFLICT (framework_id, category) DO NOTHING
  `, [frameworkId]);
  const result = await pool.query('SELECT category, target_score AS "targetScore" FROM framework_category_targets WHERE framework_id = $1 ORDER BY category', [frameworkId]);
  return result.rows;
}

async function updateCategoryTarget(frameworkId, category, targetScore) {
  const value = Number(targetScore);
  if (!category?.trim() || !Number.isFinite(value) || value < 0 || value > 5) throw Object.assign(new Error('Category and target score between 0 and 5 are required'), { status: 400 });
  const result = await pool.query(`
    INSERT INTO framework_category_targets (framework_id, category, target_score, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (framework_id, category) DO UPDATE SET target_score = EXCLUDED.target_score, updated_at = NOW()
    RETURNING category, target_score AS "targetScore"
  `, [frameworkId, category.trim(), Math.round(value * 10) / 10]);
  return result.rows[0];
}

const objectiveStatuses = ['Not started', 'On track', 'At risk', 'Achieved'];
const objectiveFrequencies = ['monthly', 'quarterly', 'semester', 'annual'];

async function listInformationSecurityObjectives(year) {
  const values = year ? [Number(year)] : [];
  const result = await pool.query(`SELECT id, objective_year AS year, objective, indicator, baseline, target_value AS "targetValue", owner, evaluation_frequency AS "evaluationFrequency", period_targets AS "periodTargets",
    monthly_status AS "monthlyStatus", quarterly_status AS "quarterlyStatus", semester_status AS "semesterStatus", annual_status AS "annualStatus", notes,
    created_at AS "createdAt", updated_at AS "updatedAt"
    FROM information_security_objectives ${year ? 'WHERE objective_year = $1' : ''} ORDER BY objective_year DESC, id`, values);
  return result.rows;
}

function normalizeObjective(data) {
  const year = Number(data?.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !String(data?.objective || '').trim()) {
    throw Object.assign(new Error('Year and objective are required'), { status: 400 });
  }
  const values = ['monthlyStatus', 'quarterlyStatus', 'semesterStatus', 'annualStatus'];
  for (const key of values) if (data[key] && !objectiveStatuses.includes(data[key])) throw Object.assign(new Error(`Invalid ${key}`), { status: 400 });
  const evaluationFrequency = data.evaluationFrequency || 'monthly';
  if (!objectiveFrequencies.includes(evaluationFrequency)) throw Object.assign(new Error('Invalid evaluation frequency'), { status: 400 });
  const periodTargets = data.periodTargets && typeof data.periodTargets === 'object' && !Array.isArray(data.periodTargets) ? data.periodTargets : {};
  return { year, objective: String(data.objective).trim(), indicator: String(data.indicator || '').trim(), baseline: String(data.baseline || '').trim(), targetValue: String(data.targetValue || '').trim(), owner: String(data.owner || '').trim(), evaluationFrequency, periodTargets, monthlyStatus: data.monthlyStatus || 'Not started', quarterlyStatus: data.quarterlyStatus || 'Not started', semesterStatus: data.semesterStatus || 'Not started', annualStatus: data.annualStatus || 'Not started', notes: String(data.notes || '').trim() };
}

async function createInformationSecurityObjective(data) {
  const item = normalizeObjective(data);
  const result = await pool.query(`INSERT INTO information_security_objectives (objective_year, objective, indicator, baseline, target_value, owner, evaluation_frequency, period_targets, monthly_status, quarterly_status, semester_status, annual_status, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id, objective_year AS year, objective, indicator, baseline, target_value AS "targetValue", owner, evaluation_frequency AS "evaluationFrequency", period_targets AS "periodTargets", monthly_status AS "monthlyStatus", quarterly_status AS "quarterlyStatus", semester_status AS "semesterStatus", annual_status AS "annualStatus", notes`, [item.year, item.objective, item.indicator, item.baseline, item.targetValue, item.owner, item.evaluationFrequency, JSON.stringify(item.periodTargets), item.monthlyStatus, item.quarterlyStatus, item.semesterStatus, item.annualStatus, item.notes]);
  return result.rows[0];
}

async function updateInformationSecurityObjective(id, data) {
  const item = normalizeObjective(data);
  const result = await pool.query(`UPDATE information_security_objectives SET objective_year=$1, objective=$2, indicator=$3, baseline=$4, target_value=$5, owner=$6, evaluation_frequency=$7, period_targets=$8, monthly_status=$9, quarterly_status=$10, semester_status=$11, annual_status=$12, notes=$13, updated_at=NOW()
    WHERE id=$14 RETURNING id, objective_year AS year, objective, indicator, baseline, target_value AS "targetValue", owner, evaluation_frequency AS "evaluationFrequency", period_targets AS "periodTargets", monthly_status AS "monthlyStatus", quarterly_status AS "quarterlyStatus", semester_status AS "semesterStatus", annual_status AS "annualStatus", notes`, [item.year, item.objective, item.indicator, item.baseline, item.targetValue, item.owner, item.evaluationFrequency, JSON.stringify(item.periodTargets), item.monthlyStatus, item.quarterlyStatus, item.semesterStatus, item.annualStatus, item.notes, id]);
  if (!result.rowCount) throw Object.assign(new Error('Objective not found'), { status: 404 });
  return result.rows[0];
}

async function deleteInformationSecurityObjective(id) {
  const result = await pool.query('DELETE FROM information_security_objectives WHERE id=$1', [id]);
  if (!result.rowCount) throw Object.assign(new Error('Objective not found'), { status: 404 });
}

async function resetIso27001Assessment() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const evidenceResult = await client.query(`
      SELECT DISTINCT jsonb_array_elements(evidence)->>'path' AS path
      FROM controls
      WHERE framework_id IN ('iso27001', 'iso27001-soa')
        AND jsonb_typeof(evidence) = 'array'
    `);
    await client.query("UPDATE controls SET evidence = '[]'::jsonb, updated_at = NOW() WHERE framework_id IN ('iso27001', 'iso27001-soa')");
    await client.query('DELETE FROM information_security_objectives');
    await client.query('COMMIT');

    const paths = evidenceResult.rows.map(row => row.path).filter(Boolean);
    if (paths.length) {
      const deletedFiles = await pool.query(`
        DELETE FROM evidence_files
        WHERE path = ANY($1::text[])
          AND NOT EXISTS (
            SELECT 1
            FROM controls AS referenced_control
            CROSS JOIN LATERAL jsonb_array_elements(
              CASE WHEN jsonb_typeof(referenced_control.evidence) = 'array'
                THEN referenced_control.evidence ELSE '[]'::jsonb END
            ) AS evidence_item
            WHERE evidence_item->>'path' = 'upload/' || evidence_files.path
              AND referenced_control.framework_id IN ('csf', 'privacy', 'iso27001', 'iso27001-soa')
          )
          AND NOT EXISTS (
            SELECT 1 FROM policy_register
            WHERE attachment_path = 'upload/' || evidence_files.path
          )
        RETURNING path
      `, [paths.map(relativePath => relativePath.replace(/^upload\//, ''))]);
      await Promise.all(deletedFiles.rows.map(async row => {
        await fs.rm(path.resolve(uploadRoot, row.path), { force: true });
      }));
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function readPrivacyCore() {
  return JSON.parse(require('fs').readFileSync(privacyData, 'utf8'));
}

async function initializeFrameworks() {
  await ensureFramework({ id: 'csf', name: 'NIST Cybersecurity Framework', version: '2.0', description: 'NIST CSF 2.0 controls' });
  await ensureFramework({ id: 'privacy', name: 'NIST Privacy Framework', version: '1.0', description: 'NIST Privacy Framework controls' });
  await ensureFramework({ id: 'iso27001', name: 'ISO/IEC 27001:2022', version: '2022', description: 'ISO 27001 clauses 4-10 requirements and audit checklist' });
  await ensureFramework({ id: 'iso27001-soa', name: 'SOA (Statement of Applicability)', version: '2022', description: 'ISO 27001:2022 Annex A controls' });
  const csfCount = await pool.query('SELECT COUNT(*)::int AS count FROM controls WHERE framework_id = $1', ['csf']);
  if (!csfCount.rows[0].count) {
    const seed = JSON.parse(await fs.readFile(`${dataRoot}/csf-data.json`, 'utf8'));
    for (const row of seed) await createControl('csf', row);
  }
  const privacyCount = await pool.query('SELECT COUNT(*)::int AS count FROM controls WHERE framework_id = $1', ['privacy']);
  if (!privacyCount.rows[0].count) {
    for (const row of readPrivacyCore()) await createControl('privacy', row);
  }
  const isoCount = await pool.query('SELECT COUNT(*)::int AS count FROM controls WHERE framework_id = $1', ['iso27001']);
  if (!isoCount.rows[0].count) {
    const seed = JSON.parse(await fs.readFile(`${dataRoot}/iso-27001-data.json`, 'utf8'));
    for (const row of seed) await createControl('iso27001', row);
  } else {
    const seed = JSON.parse(await fs.readFile(`${dataRoot}/iso-27001-data.json`, 'utf8'));
    for (const row of seed) {
      await pool.query(
        'UPDATE controls SET implementation = $1, "references" = $2, minimum_evidence = $3 WHERE framework_id = $4 AND code = $5',
        [row.implementation || '', row.references || '', row.minimumEvidence || '', 'iso27001', row.id]
      );
    }
  }
  const soaCount = await pool.query('SELECT COUNT(*)::int AS count FROM controls WHERE framework_id = $1', ['iso27001-soa']);
  const soaSeed = JSON.parse(await fs.readFile(`${dataRoot}/iso-27001-soa-data.json`, 'utf8'));
  if (!soaCount.rows[0].count) {
    for (const row of soaSeed) await createControl('iso27001-soa', row);
  } else {
    for (const row of soaSeed) await pool.query('UPDATE controls SET function = $1, category = $2, subcategory = $3, implementation = $4, "references" = $5, minimum_evidence = $6 WHERE framework_id = $7 AND code = $8', [row.function || '', row.category || '', row.subcategory || '', row.implementation || '', row.references || '', row.minimumEvidence || '', 'iso27001-soa', row.id]);
  }
  await listCategoryTargets('csf');
  await listCategoryTargets('privacy');
}

module.exports = { listFrameworks, createFramework, getControls, createControl, updateControl, updateControlEvidence, deleteControl, listCategoryTargets, updateCategoryTarget, listInformationSecurityObjectives, createInformationSecurityObjective, updateInformationSecurityObjective, deleteInformationSecurityObjective, resetIso27001Assessment, initializeFrameworks };
