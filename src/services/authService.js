// Regras do login. A sessão passa por estágios:
//
//   (sem sessão) ──senha correta──► PASSWORD_OK ──código TOTP correto──► AUTHENTICATED
//
// Em PASSWORD_OK o usuário só pode acessar as rotas do 2FA; nenhuma rota protegida.

const AppError = require('../utils/AppError');
const { comparePassword } = require('../utils/password');
const { encrypt, decrypt } = require('../utils/crypto');
const userRepository = require('../repositories/userRepository');
const totpService = require('./totpService');

const STAGES = {
  PASSWORD_OK: 'PASSWORD_OK',
  AUTHENTICATED: 'AUTHENTICATED',
};

// Bloqueio da conta: o código tem 6 dígitos (1 milhão de combinações). Com no máximo
// 5 erros seguidos a cada 15 minutos, adivinhar o código por tentativa e erro fica inviável.
const MAX_FAILED_TOTP_ATTEMPTS = 5;   //limite de 5 erros seguidos a cada 15 minutos.
const LOCK_MINUTES = 15;

function assertNotLocked(user) {
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    throw new AppError(423, 'ACCOUNT_LOCKED', `Conta bloqueada por excesso de tentativas. Tente em ${minutesLeft} minuto(s).`);
  }
}

// Código errado: conta mais uma falha; na 5ª seguida, bloqueia a conta por LOCK_MINUTES.
function registerInvalidCode(user) {
  const attempts = user.failed_attempts + 1;

  if (attempts >= MAX_FAILED_TOTP_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
    userRepository.registerFailedAttempt(user.id, 0, lockedUntil);
    throw new AppError(423, 'ACCOUNT_LOCKED', `Conta bloqueada por excesso de tentativas. Tente em ${LOCK_MINUTES} minutos.`);
  }

  userRepository.registerFailedAttempt(user.id, attempts, null);
  const remaining = MAX_FAILED_TOTP_ATTEMPTS - attempts;
  throw new AppError(401, 'INVALID_TOTP_CODE', `Código inválido ou já utilizado. ${remaining} tentativa(s) antes do bloqueio.`);
}

// Usuário da sessão pendente; se foi apagado ou desativado no meio do login, a sessão não vale mais
function findPendingUser(req) {
  const user = userRepository.findById(req.session.pendingUserId);
  if (!user || !user.active) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Conta indisponível. Faça login novamente.');
  }
  return user;
}

// Etapa 1 (primeiro fator): confere e-mail + senha e diz qual é o próximo passo.
async function verifyPassword(email, password) {  //primeiro fator, que é a verificação por senha
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

  assertNotLocked(user);

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
async function startTotpSetup(req) {   //segundo fator, o QR code
  const user = findPendingUser(req);

  // Sem isso, quem soubesse só a senha poderia cadastrar o próprio celular e "roubar" o 2FA da conta
  if (user.totp_enabled) {
    throw new AppError(409, 'TOTP_ALREADY_ENABLED', '2FA já está configurado. Informe o código do autenticador.');
  }

  const { secret, otpauthUrl, qrCode } = await totpService.createSetup(user.email);
  req.session.tempTotpSecret = secret;

  return { qrCode, manualKey: secret, otpauthUrl };
}

// Etapa 2a (confirmação): primeiro código válido → salva o segredo na conta e autentica.
async function confirmTotpSetup(req, code) {  //ativação a 2FA
  const secret = req.session.tempTotpSecret;
  if (!secret) {
    throw new AppError(400, 'TOTP_SETUP_NOT_STARTED', 'Gere o QR Code em /auth/2fa/setup antes de confirmar.');
  }

  const user = findPendingUser(req);
  assertNotLocked(user);

  const timeStep = await totpService.verifyCode(secret, code);
  if (timeStep === null) registerInvalidCode(user);

  userRepository.enableTotp(user.id, encrypt(secret), timeStep); // o banco só guarda o segredo cifrado
  userRepository.clearFailedAttempts(user.id);
  await completeAuthentication(req, user.id);

  return userRepository.findById(user.id);
}

// Etapa 2b (acessos seguintes): confere o código atual do app com o segredo salvo na conta.
async function verifyTotpLogin(req, code) {
  const user = findPendingUser(req);

  if (!user.totp_enabled) {
    throw new AppError(400, 'TOTP_NOT_CONFIGURED', '2FA ainda não configurado. Use /auth/2fa/setup.');
  }

  assertNotLocked(user);

  const secret = decrypt(user.totp_secret_enc); // decifra só em memória, só para validar
  const timeStep = await totpService.verifyCode(secret, code, user.last_totp_step);
  if (timeStep === null) registerInvalidCode(user);

  userRepository.updateLastTotpStep(user.id, timeStep); // este código não poderá ser usado de novo
  userRepository.clearFailedAttempts(user.id);
  await completeAuthentication(req, user.id);
  return user;
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
  verifyTotpLogin,
  destroySession,
};
