/**
 * Adapter HTTP: privacyController.
 * Baca req, delegasikan kasus penggunaan ke service, lalu bentuk response/error. Aturan domain dan transaksi tetap di service.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const privacyService = require('../services/privacyService');

async function list(req, res) { res.json(await privacyService.getAll()); }
async function create(req, res) { res.status(201).json(await privacyService.create(req.body)); }
async function update(req, res) { res.json(await privacyService.update(req.params.id, req.body)); }
async function remove(req, res) { await privacyService.remove(req.params.id); res.status(204).end(); }

module.exports = { list, create, update, remove };