const fs = require('fs').promises;
const path = require('path');
const { dataRoot } = require('../config/paths');
const frameworkService = require('./frameworkService');

const frameworkId = 'csf';
const requiredFields = ['id', 'function', 'category', 'subcategory', 'implementation', 'references'];

function validate(data, partial = false) {
  if (!partial && requiredFields.some(field => typeof data[field] !== 'string' || !data[field].trim())) throw Object.assign(new Error('All CSF fields are required'), { status: 400 });
  if (partial && requiredFields.slice(1).some(field => data[field] !== undefined && typeof data[field] !== 'string')) throw Object.assign(new Error('Invalid CSF field'), { status: 400 });
}

async function getAll() { return frameworkService.getControls(frameworkId); }
async function create(data) { validate(data); return frameworkService.createControl(frameworkId, data); }
async function update(id, data) { validate(data, true); return frameworkService.updateControl(frameworkId, id, data); }
async function remove(id) { return frameworkService.deleteControl(frameworkId, id); }
async function initialize() {
  const controls = await getAll();
  if (controls.length) return;
  const seed = JSON.parse(await fs.readFile(path.join(dataRoot, 'csf-data.json'), 'utf8'));
  for (const row of seed) await create(row);
}

module.exports = { getAll, create, update, remove, initialize };
