const { getAssessment, saveAssessment } = require('../services/assessmentService');
const { resetFilesForAssessment } = require('../services/fileService');

async function get(req, res) { res.json(await getAssessment(req.assessmentId || 'default')); }
async function update(req, res) { res.json(await saveAssessment(req.body, req.assessmentId || 'default')); }
async function reset(req, res) { await resetFilesForAssessment(req.assessmentId || 'default'); res.status(204).end(); }

module.exports = { get, update, reset };
