const service = require('../services/tprmService');
const workflow = require('../services/tprmWorkflowService');
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
module.exports = {
  workflow: wrap(async (req, res) => res.json(await workflow.get(req.params.id))),
  transition: wrap(async (req, res) => res.json(await workflow.act(req.params.id, req.body, req.user))),
  list: wrap(async (req, res) => res.json(await service.list())),
  create: wrap(async (req, res) => res.status(201).json(await service.create(req.body))),
  update: wrap(async (req, res) => res.json(await service.update(req.params.id, req.body, req.user))),
  remove: wrap(async (req, res) => { await service.remove(req.params.id); res.status(204).end(); })
};
