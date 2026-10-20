// Regras do login. A sessão passa por estágios:
//
//   (sem sessão) ──senha correta──► PASSWORD_OK ──código TOTP correto──► AUTHENTICATED
//
// Em PASSWORD_OK o usuário só pode acessar as rotas do 2FA; nenhuma rota protegida.

const AppError = require('../utils/AppError');
const { comparePassword } = require('../utils/password');
const userRepository = require('../repositories/userRepository');
const totpService = require('./totpService');

const STAGES = {
  PASSWORD_OK: 'PASSWORD_OK',
  AUTHENTICATED: 'AUTHENTICATED',
};

// Etapa 1 (primeiro fator): confere e-mail + senha e diz qual é o próximo passo.
async function verifyPassword(email, password) {
  const user = userRepository.findByEmail(email.trim().toLowerCase());

  // Mesma resposta para "e-mail não existe" e "senha errada":
  // o atacante não descobre quais e-mails estão cadastrados.
  const passwordMatches = user && (await comparePassword(password, user.password_hash));
  if (!passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
  }

  if (!user.active) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Conta desativada. Procure o administrador.');
  }

  // Conta nova (ou 2FA resetado pelo admin) → configuração do 2FA é obrigatória
  const next = user.totp_enabled ? 'VERIFY_2FA' : 'SETUP_2FA';
  return { user, next };
}

// Grava na sessão que o primeiro fator foi aprovado.
// regenerate() troca o ID da sessão: evita "session fixation" (atacante que plantou um ID antes do login).
function startPendingSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.pendingUserId = userId;
      req.session.stage = STAGES.PASSWORD_OK;
      resolve();
    });
  });
}

// Etapa 2a (primeiro acesso): gera o segredo e o QR Code.
// O segredo fica só na SESSÃO até o usuário provar, com um código válido, que configurou o app.
async function startTotpSetup(req) {
  const user = userRepository.findById(req.session.pendingUserId);

  // Sem isso, quem soubesse só a senha poderia cadastrar o próprio celular e "roubar" o 2FA da conta
  if (user.totp_enabled) {
    throw new AppError(409, 'TOTP_ALREADY_ENABLED', '2FA já está configurado. Informe o código do autenticador.');
  }

  const { secret, otpauthUrl, qrCode } = await totpService.createSetup(user.email);
  req.session.tempTotpSecret = secret;

  return { qrCode, manualKey: secret, otpauthUrl };
}

// Etapa 2a (confirmação): primeiro código válido → salva o segredo na conta e autentica.
async function confirmTotpSetup(req, code) {
  const secret = req.session.tempTotpSecret;
  if (!secret) {
    throw new AppError(400, 'TOTP_SETUP_NOT_STARTED', 'Gere o QR Code em /auth/2fa/setup antes de confirmar.');
  }

  const timeStep = await totpService.verifyCode(secret, code);
  if (timeStep === null) {
    throw new AppError(401, 'INVALID_TOTP_CODE', 'Código inválido. Confira o app autenticador e tente novamente.');
  }

  const userId = req.session.pendingUserId;
  userRepository.enableTotp(userId, secret);
  await completeAuthentication(req, userId);

  return userRepository.findById(userId);
}

// Os dois fatores foram aprovados: a sessão passa para AUTHENTICATED.
// mfaVerifiedAt marca quando o código foi validado (usado para exigir o 2FA de novo depois de um tempo).
function completeAuthentication(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId;
      req.session.stage = STAGES.AUTHENTICATED;
      req.session.mfaVerifiedAt = Date.now();
      resolve();
    });
  });
}

// Logout: apaga a sessão no servidor, então o cookie antigo deixa de valer.
function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = {
  STAGES,
  verifyPassword,
  startPendingSession,
  startTotpSetup,
  confirmTotpSetup,
  destroySession,
};
