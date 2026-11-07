/**
 * Adapter HTTP: personnelCertificationController.
 * Baca req, delegasikan kasus penggunaan ke service, lalu bentuk response/error. Aturan domain dan transaksi tetap di service.
 * Peta fungsi dan dependency: docs/source-catalog.json.
 */
const service = require('../services/personnelCertificationService');
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
module.exports = {
  list: wrap(async (req, res) => res.json(await service.list())),
  create: wrap(async (req, res) => res.status(201).json(await require('../services/personnelCertificateFileService').saveRequest(req, null))),
  update: wrap(async (req, res) => res.json(await require('../services/personnelCertificateFileService').saveRequest(req, req.params.id))),
  updateLayout: wrap(async (req, res) => res.json(await service.updateLayout(req.params.id, req.body))),
  remove: wrap(async (req, res) => { await service.remove(req.params.id); res.status(204).end(); }),
  organizationList: wrap(async (req, res) => res.json(await service.listOrganizationPersonnel())),
  organizationCreate: wrap(async (req, res) => res.status(201).json(await service.createOrganizationPersonnel(req.body))),
  organizationUpdate: wrap(async (req, res) => res.json(await service.updateOrganizationPersonnel(req.params.personnelId, req.body))),
  organizationDelete: wrap(async (req, res) => { await service.removeOrganizationPersonnel(req.params.personnelId); res.status(204).end(); })
};
