const service = require('../services/tprmQuestionnaireService');
const evidenceAccess = require('../services/evidenceAccessService');
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
module.exports = {
  list: wrap(async (req, res) => res.json(await service.list())),
  create: wrap(async (req, res) => res.status(201).json(await service.create(req.body))),
  update: wrap(async (req, res) => {
    const current = await service.get(req.params.id);
    res.json(await service.update(req.params.id, { ...current, ...req.body, responses: { ...(current.responses || {}), ...(req.body.responses || {}) } }));
  }),
  updateDocuments: wrap(async (req, res) => {
    const current = await service.get(req.params.id);
    const documents = req.body?.documents;
    await evidenceAccess.assertReferences(documents, current.responses?.vendorDocuments, req.user);
    const responses = { ...(current.responses || {}), vendorDocuments: documents };
    res.json(await service.update(req.params.id, { ...current, responses }));
  }),
  remove: wrap(async (req, res) => { await service.remove(req.params.id); res.status(204).end(); })
};
