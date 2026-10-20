// SQL dos empréstimos. As consultas trazem junto o patrimônio/modelo do equipamento
// e o nome do técnico que registrou, para o histórico ficar legível.

const db = require('../config/database');

const SELECT_WITH_DETAILS = `
  SELECT loans.*,
         equipment.asset_tag AS equipment_asset_tag,
         equipment.brand || ' ' || equipment.model AS equipment_description,
         users.name AS technician_name
  FROM loans
  JOIN equipment ON equipment.id = loans.equipment_id
  JOIN users ON users.id = loans.technician_id
`;

// Filtro opcional: ?status=active | returned
function findAll({ status } = {}) {
  if (status) {
    return db.prepare(`${SELECT_WITH_DETAILS} WHERE loans.status = ? ORDER BY loans.id DESC`).all(status);
  }
  return db.prepare(`${SELECT_WITH_DETAILS} ORDER BY loans.id DESC`).all();
}

function findById(id) {
  return db.prepare(`${SELECT_WITH_DETAILS} WHERE loans.id = ?`).get(id);
}

function create(loan) {
  const result = db
    .prepare(`
      INSERT INTO loans (equipment_id, technician_id, borrower_name, destination_department,
                         checkout_date, expected_return_date, notes, status)
      VALUES (:equipment_id, :technician_id, :borrower_name, :destination_department,
              :checkout_date, :expected_return_date, :notes, 'active')
    `)
    .run(loan);
  return findById(result.lastInsertRowid);
}

function markReturned(id, returnedAt) {
  db.prepare("UPDATE loans SET status = 'returned', returned_at = ? WHERE id = ?").run(returnedAt, id);
  return findById(id);
}

module.exports = { findAll, findById, create, markReturned };
