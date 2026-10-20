// Recebe as requisições de autenticação, chama o authService e monta a resposta HTTP.

const authService = require('../services/authService');
const { toPublicUser } = require('../services/userService');

const NEXT_STEP_MESSAGES = {
  SETUP_2FA: 'Senha correta. Configure o 2FA para continuar.',
  VERIFY_2FA: 'Senha correta. Informe o código do autenticador.',
};

// POST /auth/login
async function login(req, res) {
  const { email, password } = req.body;
  const { user, next } = await authService.verifyPassword(email, password);
  await authService.startPendingSession(req, user.id);

  res.json({ message: NEXT_STEP_MESSAGES[next], next });
}

// GET /auth/2fa/setup
async function setupTotp(req, res) {
  const setup = await authService.startTotpSetup(req);
  res.json(setup);
}

// POST /auth/2fa/enable
async function enableTotp(req, res) {
  const user = await authService.confirmTotpSetup(req, req.body.code);
  res.json({ message: '2FA ativado com sucesso.', user: toPublicUser(user) });
}

// POST /auth/logout
async function logout(req, res) {
  await authService.destroySession(req);
  res.clearCookie('sid');
  res.json({ message: 'Sessão encerrada.' });
}

module.exports = { login, setupTotp, enableTotp, logout };
