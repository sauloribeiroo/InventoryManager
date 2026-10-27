const AppError = require('../utils/AppError');
const { toISODate, addBusinessDays } = require('../utils/formatDate');
const { runInTransaction } = require('../utils/transaction');
const loanRepository = require('../repositories/loanRepository');
const equipmentRepository = require('../repositories/equipmentRepository');
const holidayService = require('./holidayService');
const { STATUSES } = require('../models/Loan');

function withOverdueFlag(loan) {
  const today = toISODate(new Date());
  return { ...loan, is_overdue: loan.status === 'active' && loan.expected_return_date < today };
}

function list(filters = {}) {
  if (filters.status && !STATUSES.includes(filters.status)) {
    throw new AppError(400, 'VALIDATION_ERROR', `status deve ser um destes: ${STATUSES.join(', ')}.`);
  }
  return loanRepository.findAll(filters).map(withOverdueFlag);
}

async function create(data, technicianId) {
  const equipment = equipmentRepository.findById(data.equipment_id);
  if (!equipment) throw new AppError(404, 'NOT_FOUND', 'Equipamento não encontrado.');
  if (equipment.status !== 'available') {
    throw new AppError(409, 'CONFLICT', `Equipamento ${equipment.asset_tag} não está disponível (status: ${equipment.status}).`);
  }

  const today = new Date();
  const { holidays, checked } = await holidayService.getHolidayMap([today.getFullYear(), today.getFullYear() + 1]);
  const { date: expectedReturn, skippedHolidays } = addBusinessDays(
    today,
    data.business_days,
    (date) => holidays.has(toISODate(date))
  );

    const loan = runInTransaction(() => {
      const reservou = equipmentRepository.emprestadoSeDisponivel(equipment.id);
      if (!reservou) {
        throw new AppError(409, 'CONFLICT', `Equipamento ${equipment.asset_tag} acabou de ser emprestado ou não está disponível.`);
      }
  
      return loanRepository.create({
        equipment_id: equipment.id,
        technician_id: technicianId,
        borrower_name: data.borrower_name.trim(),
        destination_department: data.destination_department.trim(),
        checkout_date: toISODate(today),
        expected_return_date: toISODate(expectedReturn),
        notes: data.notes?.trim() || null,
      });
    });
  

  return {
    ...withOverdueFlag(loan),
    skipped_holidays: skippedHolidays.map((date) => ({ date, name: holidays.get(date) })),
    holidays_checked: checked,
  };
}

function returnLoan(id) {
  const loan = loanRepository.findById(id);
  if (!loan) throw new AppError(404, 'NOT_FOUND', 'Empréstimo não encontrado.');
  if (loan.status === 'returned') {
    throw new AppError(409, 'CONFLICT', 'Este empréstimo já foi devolvido.');
  }

  const returned = runInTransaction(() => {
    const updated = loanRepository.markReturned(id, toISODate(new Date()));
    equipmentRepository.updateStatus(loan.equipment_id, 'available');
    return updated;
  });

  return withOverdueFlag(returned);
}

module.exports = { list, create, returnLoan };
