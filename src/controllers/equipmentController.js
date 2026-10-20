// Consulta do estoque (somente technician).

const equipmentService = require('../services/equipmentService');

// GET /api/equipment?status=available&type=notebook
function list(req, res) {
  const { status, type } = req.query;
  res.json(equipmentService.list({ status, type }));
}

// GET /api/equipment/:id
function getById(req, res) {
  res.json(equipmentService.getById(Number(req.params.id)));
}

module.exports = { list, getById };
