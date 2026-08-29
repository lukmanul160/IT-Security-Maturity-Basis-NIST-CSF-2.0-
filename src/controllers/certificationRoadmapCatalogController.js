const service = require('../services/certificationRoadmapCatalogService');
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
module.exports = {
  list: wrap(async (req, res) => res.json(await service.list()))
};
