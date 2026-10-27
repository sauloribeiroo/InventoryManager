const AppError = require('../utils/AppError');
const { hashPassword } = require('../utils/password');
const userRepository = require('../repositories/userRepository');

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    totp_enabled: Boolean(user.totp_enabled),
    active: Boolean(user.active),
    created_at: user.created_at,
  };
}

function findOrFail(id) {
  const user = userRepository.findById(id);
  if (!user) throw new AppError(404, 'NOT_FOUND', 'Usuário não encontrado.');
  return user;
}

function assertEmailAvailable(email, ignoreId = null) {
  const existing = userRepository.findByEmail(email);
  if (existing && existing.id !== ignoreId) {
    throw new AppError(409, 'CONFLICT', 'Já existe um usuário com este e-mail.');
  }
}

function assertNotSelf(targetId, currentUserId, action) {
  if (targetId === currentUserId) {
    throw new AppError(400, 'SELF_ACTION_NOT_ALLOWED', `Você não pode ${action} a sua própria conta.`);
  }
}

function list() {
  return userRepository.findAll().map(toPublicUser);
}

function getById(id) {
  return toPublicUser(findOrFail(id));
}

async function create({ name, email, password, role }) {
  const normalizedEmail = email.trim().toLowerCase();
  assertEmailAvailable(normalizedEmail);

  const user = userRepository.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    role,
  });
  return toPublicUser(user);
}

async function update(id, data, currentUserId) {
  findOrFail(id);

  const fields = {};
  if (data.name !== undefined) fields.name = data.name.trim();
  if (data.email !== undefined) {
    fields.email = data.email.trim().toLowerCase();
    assertEmailAvailable(fields.email, id);
  }
  if (data.role !== undefined) {
    if (data.role !== 'admin') assertNotSelf(id, currentUserId, 'rebaixar');
    fields.role = data.role;
  }
  if (data.active !== undefined) {
    if (!data.active) assertNotSelf(id, currentUserId, 'desativar');
    fields.active = data.active ? 1 : 0;
  }
  if (data.password !== undefined) fields.password_hash = await hashPassword(data.password);

  return toPublicUser(userRepository.update(id, fields));
}

function remove(id, currentUserId) {
  findOrFail(id);
  assertNotSelf(id, currentUserId, 'excluir');

  if (userRepository.hasLoans(id)) {
    throw new AppError(409, 'CONFLICT', 'Usuário possui empréstimos registrados. Desative a conta em vez de excluir.');
  }
  userRepository.remove(id);
}

function resetTotp(id) {
  findOrFail(id);
  userRepository.resetTotp(id);
  return toPublicUser(userRepository.findById(id));
}

module.exports = { toPublicUser, list, getById, create, update, remove, resetTotp };
