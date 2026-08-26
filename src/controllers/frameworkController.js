const frameworkService = require('../services/frameworkService');

async function list(req, res) { res.json(await frameworkService.listFrameworks()); }
async function create(req, res) { res.status(201).json(await frameworkService.createFramework(req.body)); }
async function listControls(req, res) { res.json(await frameworkService.getControls(req.params.frameworkId)); }
async function createControl(req, res) { res.status(201).json(await frameworkService.createControl(req.params.frameworkId, req.body)); }
async function updateControl(req, res) { res.json(await frameworkService.updateControl(req.params.frameworkId, req.params.code, req.body)); }
async function deleteControl(req, res) { await frameworkService.deleteControl(req.params.frameworkId, req.params.code); res.status(204).end(); }

module.exports = { list, create, listControls, createControl, updateControl, deleteControl };