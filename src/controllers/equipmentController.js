// Consulta do estoque (somente technician).

const equipmentService = require('../services/equipmentService');

// GET /api/equipment?status=available&type=notebook
async function list(req, res) {
  const { status, type } = req.query;
  res.json(await equipmentService.list({ status, type }));
}

// GET /api/equipment/:id
async function getById(req, res) {
  res.json(await equipmentService.getById(Number(req.params.id)));
}

module.exports = { list, getById };
