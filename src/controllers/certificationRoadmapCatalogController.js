/**
 * Adapter HTTP: certificationRoadmapCatalogController.
 * Baca req, delegasikan kasus penggunaan ke service, lalu bentuk response/error. Aturan domain dan transaksi tetap di service.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const service = require('../services/certificationRoadmapCatalogService');
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
module.exports = {
  list: wrap(async (req, res) => res.json(await service.list())),
  create: wrap(async (req, res) => res.status(201).json(await service.create(req.body || {}))),
  update: wrap(async (req, res) => res.json(await service.update(req.params.id, req.body || {}))),
  remove: wrap(async (req, res) => { await service.remove(req.params.id); res.status(204).end(); })
};
