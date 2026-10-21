// Recebe as requisições de autenticação, chama o authService e monta a resposta HTTP.

const authService = require('../services/authService');
const { toPublicUser } = require('../services/userService');
const env = require('../config/env');

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
  res.json(setup);   //chama e devolve o QR CODE
}

// POST /auth/2fa/enable
async function enableTotp(req, res) {
  const user = await authService.confirmTotpSetup(req, req.body.code);
  res.json({ message: '2FA ativado com sucesso.', user: toPublicUser(user) });
}

// POST /auth/2fa/verify
async function verifyTotp(req, res) {
  const user = await authService.verifyTotpLogin(req, req.body.code);
  res.json({ message: 'Autenticado com sucesso.', user: toPublicUser(user) });  //confere o código dos acessos seguintes
}

// GET /auth/me — quem está logado e até quando o 2FA vale
function me(req, res) {
  const mfaExpiresAt = new Date(req.session.mfaVerifiedAt + env.mfaTtlMinutes * 60 * 1000);
  res.json({ user: toPublicUser(req.user), mfa_expires_at: mfaExpiresAt.toISOString() });
}

// POST /auth/logout
async function logout(req, res) {   //fim da sessão
  await authService.destroySession(req);
  res.clearCookie('sid');
  res.json({ message: 'Sessão encerrada.' });
}

module.exports = { login, setupTotp, enableTotp, verifyTotp, me, logout };
