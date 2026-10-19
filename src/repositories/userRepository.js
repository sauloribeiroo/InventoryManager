// Único lugar com SQL de usuários. Os services chamam estas funções sem saber que o banco é SQLite.

const db = require('../config/database');

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

module.exports = { findByEmail, findById };
