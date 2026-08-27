const service = require('../services/riskAcceptanceService');

async function list(req, res) { res.json(await service.list()); }
async function create(req, res) { res.status(201).json(await service.create(req.body)); }
async function update(req, res) { res.json(await service.update(req.params.id, req.body)); }
async function remove(req, res) { await service.remove(req.params.id); res.status(204).end(); }
async function exportPdf(req, res) { const document = await service.exportPdf(req.params.id); res.type('application/pdf').attachment(`Cybersecurity-Risk-Acceptance-Form-${req.params.id}.pdf`).send(document); }

module.exports = { list, create, update, remove, exportPdf };
