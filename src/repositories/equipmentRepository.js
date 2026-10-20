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

module.exports = { findAll, findById, updateStatus };
