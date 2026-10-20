// Regras de negócio do estoque de equipamentos (acesso do técnico).

const AppError = require('../utils/AppError');
const equipmentRepository = require('../repositories/equipmentRepository');
const { STATUSES, TYPES } = require('../models/Equipment');

function list(filters = {}) {
  if (filters.status && !STATUSES.includes(filters.status)) {
    throw new AppError(400, 'VALIDATION_ERROR', `status deve ser um destes: ${STATUSES.join(', ')}.`);
  }
  if (filters.type && !TYPES.includes(filters.type)) {
    throw new AppError(400, 'VALIDATION_ERROR', `type deve ser um destes: ${TYPES.join(', ')}.`);
  }
  return equipmentRepository.findAll(filters);
}

function getById(id) {
  const equipment = equipmentRepository.findById(id);
  if (!equipment) throw new AppError(404, 'NOT_FOUND', 'Equipamento não encontrado.');
  return equipment;
}

module.exports = { list, getById };
