const frameworkService = require('../services/frameworkService');
const evidenceAccess = require('../services/evidenceAccessService');
const { pool } = require('../config/database');
async function checkEvidence(req, create = false) {
  if (req.body.evidence === undefined) return;
  const previous = create ? [] : (await pool.query('SELECT evidence FROM controls WHERE framework_id=$1 AND code=$2', [req.params.frameworkId,req.params.code])).rows[0]?.evidence;
  await evidenceAccess.assertReferences(req.body.evidence, previous, req.user);
}

async function list(req, res) { res.json(await frameworkService.listFrameworks()); }
async function create(req, res) { res.status(201).json(await frameworkService.createFramework(req.body)); }
async function listControls(req, res) { res.json(await frameworkService.getControls(req.params.frameworkId)); }
async function createControl(req, res) { await checkEvidence(req,true); res.status(201).json(await frameworkService.createControl(req.params.frameworkId, req.body)); }
async function updateControl(req, res) { await checkEvidence(req); res.json(await frameworkService.updateControl(req.params.frameworkId, req.params.code, req.body)); }
async function updateControlEvidence(req, res) { await checkEvidence(req); res.json(await frameworkService.updateControlEvidence(req.params.frameworkId, req.params.code, req.body.evidence)); }
async function deleteControl(req, res) { await frameworkService.deleteControl(req.params.frameworkId, req.params.code); res.status(204).end(); }
async function listCategoryTargets(req, res) { res.json(await frameworkService.listCategoryTargets(req.params.frameworkId)); }
async function updateCategoryTarget(req, res) { res.json(await frameworkService.updateCategoryTarget(req.params.frameworkId, req.params.category, req.body.targetScore)); }
async function listInformationSecurityObjectives(req, res) { res.json(await frameworkService.listInformationSecurityObjectives(req.query.year)); }
async function createInformationSecurityObjective(req, res) { res.status(201).json(await frameworkService.createInformationSecurityObjective(req.body)); }
async function updateInformationSecurityObjective(req, res) { res.json(await frameworkService.updateInformationSecurityObjective(req.params.id, req.body)); }
async function deleteInformationSecurityObjective(req, res) { await frameworkService.deleteInformationSecurityObjective(req.params.id); res.status(204).end(); }
async function resetIso27001Assessment(req, res) { await frameworkService.resetIso27001Assessment(); res.status(204).end(); }

module.exports = { list, create, listControls, createControl, updateControl, updateControlEvidence, deleteControl, listCategoryTargets, updateCategoryTarget, listInformationSecurityObjectives, createInformationSecurityObjective, updateInformationSecurityObjective, deleteInformationSecurityObjective, resetIso27001Assessment };
