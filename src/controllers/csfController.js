const csfService = require('../services/csfService');

async function list(req, res) { res.json(await csfService.getAll()); }
async function create(req, res) { res.status(201).json(await csfService.create(req.body)); }
async function update(req, res) { res.json(await csfService.update(req.params.id, req.body)); }
async function remove(req, res) { await csfService.remove(req.params.id); res.status(204).end(); }

module.exports = { list, create, update, remove };
