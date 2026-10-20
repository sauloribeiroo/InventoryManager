// Único lugar com SQL de usuários. Os services chamam estas funções sem saber que o banco é SQLite.

const db = require('../config/database');

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// Ativa o 2FA: grava o segredo TOTP (já cifrado pelo service) e o passo do código usado na confirmação.
function enableTotp(id, encryptedSecret, timeStep) {
  db.prepare(
    'UPDATE users SET totp_secret_enc = ?, totp_enabled = 1, last_totp_step = ? WHERE id = ?'
  ).run(encryptedSecret, timeStep, id);
}

// Anti-replay: guarda o passo de tempo do último código aceito.
function updateLastTotpStep(id, timeStep) {
  db.prepare('UPDATE users SET last_totp_step = ? WHERE id = ?').run(timeStep, id);
}

// Bloqueio por tentativas: grava o número de erros seguidos e, se for o caso, até quando a conta fica bloqueada.
function registerFailedAttempt(id, failedAttempts, lockedUntil) {
  db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(failedAttempts, lockedUntil, id);
}

// Código certo: zera o contador de erros e remove qualquer bloqueio.
function clearFailedAttempts(id) {
  db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(id);
}

module.exports = {
  findByEmail,
  findById,
  enableTotp,
  updateLastTotpStep,
  registerFailedAttempt,
  clearFailedAttempts,
};
