const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const databasePath = require.resolve('../src/config/database');
const servicePath = require.resolve('../src/services/questionnaireTemplateService');
const { pool } = require('../src/config/database');
const originalQuery = pool.query.bind(pool);
const originalReadFileSync = fs.readFileSync;

function restore() {
  pool.query = originalQuery;
  fs.readFileSync = originalReadFileSync;
  delete require.cache[databasePath];
  delete require.cache[servicePath];
}

test('ensureStore falls back when template markdown files are missing', async () => {
  pool.query = async (sql) => {
    if (typeof sql === 'string' && sql.includes('SELECT template_name')) {
      return { rows: [] };
    }
    return { rows: [] };
  };

  fs.readFileSync = (filePath, ...args) => {
    const target = String(filePath);
    if (target.includes('due-diligence-questionnaire.md') || target.includes('software-developer-checklist.md')) {
      throw Object.assign(new Error('ENOENT: missing template file'), { code: 'ENOENT' });
    }
    return originalReadFileSync.call(fs, filePath, ...args);
  };

  delete require.cache[servicePath];

  const service = require('../src/services/questionnaireTemplateService');
  await assert.doesNotReject(() => service.ensureStore());

  restore();
});

test('creating an imported template preserves its default flag and sections', async () => {
  const sections = [['Security', ['Is MFA enabled?']]];
  require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { pool } };
  pool.query = async (sql, values) => {
    assert.ok(sql.includes('sections, is_default'));
    assert.equal(values[3], true);
    return { rows: [{ id: 5, template_name: values[0], sections: values[2], is_default: values[3] }] };
  };
  try {
    delete require.cache[servicePath];
    const saved = await require(servicePath).create({ template_name: 'Imported template', sections, is_default: true });
    assert.deepEqual(saved.sections, sections);
    assert.equal(saved.is_default, true);
  } finally { restore(); }
});

process.on('exit', restore);
