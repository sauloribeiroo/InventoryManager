// Único lugar com SQL de usuários. Os services chamam estas funções sem saber que o banco é SQLite.

const db = require('../config/database');

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// Ativa o 2FA: grava o segredo TOTP confirmado pelo usuário.
function enableTotp(id, secret) {
  db.prepare(
    'UPDATE users SET totp_secret_enc = ?, totp_enabled = 1, last_totp_step = NULL WHERE id = ?'
  ).run(secret, id);
}

module.exports = { findByEmail, findById, enableTotp };
