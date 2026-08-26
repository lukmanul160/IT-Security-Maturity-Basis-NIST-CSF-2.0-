const frameworkService = require('./frameworkService');

const frameworkId = 'privacy';

async function getAll() { return frameworkService.getControls(frameworkId); }
async function create(data) { return frameworkService.createControl(frameworkId, data); }
async function update(id, data) { return frameworkService.updateControl(frameworkId, id, data); }
async function remove(id) { return frameworkService.deleteControl(frameworkId, id); }

module.exports = { getAll, create, update, remove };
