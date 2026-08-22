const { getAssessment, saveAssessment, emptyState } = require('../services/assessmentService');
const { resetFiles } = require('../services/fileService');

async function get(req, res) { res.json(await getAssessment()); }
async function update(req, res) { res.json(await saveAssessment(req.body)); }
async function reset(req, res) { await resetFiles(); res.json(await saveAssessment(emptyState)); }

module.exports = { get, update, reset };
