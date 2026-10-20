// Gerenciamento de contas (somente admin).

const userService = require('../services/userService');

// GET /api/users
function list(req, res) {
  res.json(userService.list());
}

// GET /api/users/:id
function getById(req, res) {
  res.json(userService.getById(Number(req.params.id)));
}

// POST /api/users
async function create(req, res) {
  const user = await userService.create(req.body);
  res.status(201).json(user);
}

// PUT /api/users/:id
async function update(req, res) {
  const user = await userService.update(Number(req.params.id), req.body, req.user.id);
  res.json(user);
}

// DELETE /api/users/:id
function remove(req, res) {
  userService.remove(Number(req.params.id), req.user.id);
  res.status(204).end();
}

// POST /api/users/:id/reset-2fa
function resetTotp(req, res) {
  const user = userService.resetTotp(Number(req.params.id));
  res.json({ message: '2FA resetado. O usuário configurará um novo QR Code no próximo login.', user });
}

module.exports = { list, getById, create, update, remove, resetTotp };
