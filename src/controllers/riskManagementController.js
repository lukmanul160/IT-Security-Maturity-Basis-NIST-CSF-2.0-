const service = require('../services/riskManagementService');
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
module.exports = {
  dashboard: wrap(async (req, res) => res.json(await service.dashboard())),
  indicators: wrap(async (req, res) => res.json(await service.listIndicators())),
  dropdowns: wrap(async (req, res) => res.json(await service.listDropdowns())),
  createDropdown: wrap(async (req, res) => res.status(201).json(await service.createDropdown(req.body))),
  updateDropdown: wrap(async (req, res) => res.json(await service.updateDropdown(req.params.id, req.body))),
  removeDropdown: wrap(async (req, res) => { await service.removeDropdown(req.params.id); res.status(204).end(); }),
  createIndicator: wrap(async (req, res) => res.status(201).json(await service.createIndicator(req.body))),
  updateIndicator: wrap(async (req, res) => res.json(await service.updateIndicator(req.params.id, req.body))),
  removeIndicator: wrap(async (req, res) => { await service.removeIndicator(req.params.id); res.status(204).end(); }),
  list: wrap(async (req, res) => res.json(await service.listRegister())),
  create: wrap(async (req, res) => res.status(201).json(await service.create(req.body))),
  update: wrap(async (req, res) => res.json(await service.update(req.params.id, req.body))),
  remove: wrap(async (req, res) => { await service.remove(req.params.id); res.status(204).end(); }),
  reset: wrap(async (req, res) => { await service.resetRegister(); res.status(204).end(); })
};