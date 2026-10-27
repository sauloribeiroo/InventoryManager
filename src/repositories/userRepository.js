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

function resetTotp(id) {
  db.prepare(`
    UPDATE users
    SET totp_secret_enc = NULL, totp_enabled = 0, last_totp_step = NULL, failed_attempts = 0, locked_until = NULL
    WHERE id = ?
  `).run(id);
}

function enableTotp(id, encryptedSecret, timeStep) {
  db.prepare(
    'UPDATE users SET totp_secret_enc = ?, totp_enabled = 1, last_totp_step = ? WHERE id = ?'
  ).run(encryptedSecret, timeStep, id);
}

function updateLastTotpStep(id, timeStep) {
  db.prepare('UPDATE users SET last_totp_step = ? WHERE id = ?').run(timeStep, id);
}

function registerFailedAttempt(id, failedAttempts, lockedUntil) {
  db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(failedAttempts, lockedUntil, id);
}

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
