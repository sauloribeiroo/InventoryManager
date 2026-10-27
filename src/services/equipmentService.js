const AppError = require('../utils/AppError');
const equipmentRepository = require('../repositories/equipmentRepository');
const exchangeRateService = require('./exchangeRateService');
const { STATUSES, TYPES } = require('../models/Equipment');

function withValueInBrl(equipment, rate) {
  return {
    ...equipment,
    value_brl: rate ? Math.round(equipment.value_usd * rate.usd_brl * 100) / 100 : null,
    exchange_rate: rate,
  };
}

async function list(filters = {}) {
  if (filters.status && !STATUSES.includes(filters.status)) {
    throw new AppError(400, 'VALIDATION_ERROR', `status deve ser um destes: ${STATUSES.join(', ')}.`);
  }
  if (filters.type && !TYPES.includes(filters.type)) {
    throw new AppError(400, 'VALIDATION_ERROR', `type deve ser um destes: ${TYPES.join(', ')}.`);
  }

  const items = equipmentRepository.findAll(filters);
  const rate = await exchangeRateService.getUsdBrlRate();
  return items.map((item) => withValueInBrl(item, rate));
}

async function getById(id) {
  const equipment = equipmentRepository.findById(id);
  if (!equipment) throw new AppError(404, 'NOT_FOUND', 'Equipamento não encontrado.');

  const rate = await exchangeRateService.getUsdBrlRate();
  return withValueInBrl(equipment, rate);
}

module.exports = { list, getById };
