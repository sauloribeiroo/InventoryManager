// Hash de senhas com bcrypt (primeiro fator: "algo que você sabe").
// O bcrypt gera um salt aleatório por senha e é lento de propósito,
// o que torna ataques de força bruta sobre um banco vazado muito caros.

const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10; // custo: 2^10 iterações

function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hashPassword, comparePassword };
