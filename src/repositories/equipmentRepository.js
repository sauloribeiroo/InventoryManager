// SQL dos equipamentos do estoque.

const db = require('../config/database');

// Filtros opcionais: ?status=available&type=notebook
function findAll({ status, type } = {}) {
  const conditions = [];
  const params = {};
  if (status) {
    conditions.push('status = :status');
    params.status = status;
  }
  if (type) {
    conditions.push('type = :type');
    params.type = type;
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM equipment ${where} ORDER BY asset_tag`).all(params);
}

function findById(id) {
  return db.prepare('SELECT * FROM equipment WHERE id = ?').get(id);
}

// Usado pelos empréstimos: available ↔ loaned
function updateStatus(id, status) {
  db.prepare('UPDATE equipment SET status = ? WHERE id = ?').run(status, id);
}

//para controlar a reserva de equipamento : só vai mudar para 'loaned' se ele estiver 'available'
// vai devolver true se conseguir reservar ou false se outro emprestimo chegar primeiro
function emprestadoSeDisponivel(id){
  const resultado = db
  .prepare("UPDATE equipment SET status = 'loaned' WHERE id = ? AND status = 'available'")
  .run(id);

  return resultado.changes === 1;
}
module.exports = { findAll, findById, updateStatus, emprestadoSeDisponivel};
