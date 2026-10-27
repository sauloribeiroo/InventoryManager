const equipmentService = require('../services/equipmentService');

async function list(req, res) {
  const { status, type } = req.query;
  res.json(await equipmentService.list({ status, type }));
}

async function getById(req, res) {
  res.json(await equipmentService.getById(Number(req.params.id)));
}

module.exports = { list, getById };
