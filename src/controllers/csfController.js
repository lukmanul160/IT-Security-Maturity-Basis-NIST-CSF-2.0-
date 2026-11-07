/**
 * Adapter HTTP: csfController.
 * Baca req, delegasikan kasus penggunaan ke service, lalu bentuk response/error. Aturan domain dan transaksi tetap di service.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const csfService = require('../services/csfService');

async function list(req, res) { res.json(await csfService.getAll()); }
async function create(req, res) { res.status(201).json(await csfService.create(req.body)); }
async function update(req, res) { res.json(await csfService.update(req.params.id, req.body)); }
async function remove(req, res) { await csfService.remove(req.params.id); res.status(204).end(); }

module.exports = { list, create, update, remove };
