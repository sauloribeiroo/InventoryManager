// Único lugar com SQL de usuários. Os services chamam estas funções sem saber que o banco é SQLite.

const db = require('../config/database');

function findByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function findById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function findAll() {
  return db.prepare('SELECT * FROM users ORDER BY id').all();
}

function create({ name, email, passwordHash, role }) {
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, passwordHash, role);
  return findById(result.lastInsertRowid);
}

// Atualiza só os campos recebidos. As chaves vêm de uma lista fixa no service (nunca do usuário),
// então montar o SET dinamicamente não abre brecha para SQL injection.
function update(id, fields) {
  const columns = Object.keys(fields);
  if (columns.length === 0) return findById(id);

  const setClause = columns.map((column) => `${column} = :${column}`).join(', ');
  db.prepare(`UPDATE users SET ${setClause} WHERE id = :id`).run({ ...fields, id });
  return findById(id);
}

function remove(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function hasLoans(id) {
  return Boolean(db.prepare('SELECT 1 FROM loans WHERE technician_id = ? LIMIT 1').get(id));
}

// Reset do 2FA pelo admin: apaga o segredo; no próximo login o usuário configura um novo QR Code.
function resetTotp(id) {
  db.prepare(`
    UPDATE users
    SET totp_secret_enc = NULL, totp_enabled = 0, last_totp_step = NULL, failed_attempts = 0, locked_until = NULL
    WHERE id = ?
  `).run(id);
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
  findAll,
  create,
  update,
  remove,
  hasLoans,
  resetTotp,
  enableTotp,
  updateLastTotpStep,
  registerFailedAttempt,
  clearFailedAttempts,
};
