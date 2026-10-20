// Executa várias operações no banco como uma só: ou todas são gravadas, ou nenhuma.
// Ex.: registrar o empréstimo E marcar o equipamento como emprestado.

const db = require('../config/database');

function runInTransaction(work) {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { runInTransaction };
