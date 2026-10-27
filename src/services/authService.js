const AppError = require('../utils/AppError');
const { comparePassword } = require('../utils/password');
const { encrypt, decrypt } = require('../utils/crypto');
const userRepository = require('../repositories/userRepository');
const totpService = require('./totpService');

const DUMMY_HASH = '$2b$10$d7N2ehtLqv4fsbAw6PC0Te7s/PW1AqBRIngrXGYteTrKtdL5UBC2u';

const STAGES = {
  PASSWORD_OK: 'PASSWORD_OK',
  AUTHENTICATED: 'AUTHENTICATED',
};

const MAX_FAILED_TOTP_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

function assertNotLocked(user) {
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    throw new AppError(423, 'ACCOUNT_LOCKED', `Conta bloqueada por excesso de tentativas. Tente em ${minutesLeft} minuto(s).`);
  }
}

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

function findPendingUser(req) {
  const user = userRepository.findById(req.session.pendingUserId);
  if (!user || !user.active) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Conta indisponível. Faça login novamente.');
  }
  return user;
}

async function verifyPassword(email, password) {
  const user = userRepository.findByEmail(email.trim().toLowerCase());

  const passwordMatches = await comparePassword(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
  }

  if (!user.active) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Conta desativada. Procure o administrador.');
  }

  assertNotLocked(user);

  const next = user.totp_enabled ? 'VERIFY_2FA' : 'SETUP_2FA';
  return { user, next };
}

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

async function startTotpSetup(req) {
  const user = findPendingUser(req);

  if (user.totp_enabled) {
    throw new AppError(409, 'TOTP_ALREADY_ENABLED', '2FA já está configurado. Informe o código do autenticador.');
  }

  const { secret, otpauthUrl, qrCode } = await totpService.createSetup(user.email);
  req.session.tempTotpSecret = secret;

  return { qrCode, manualKey: secret, otpauthUrl };
}

async function confirmTotpSetup(req, code) {
  const secret = req.session.tempTotpSecret;
  if (!secret) {
    throw new AppError(400, 'TOTP_SETUP_NOT_STARTED', 'Gere o QR Code em /auth/2fa/setup antes de confirmar.');
  }

  const user = findPendingUser(req);
  assertNotLocked(user);

  const timeStep = await totpService.verifyCode(secret, code);
  if (timeStep === null) registerInvalidCode(user);

  userRepository.enableTotp(user.id, encrypt(secret), timeStep);
  userRepository.clearFailedAttempts(user.id);
  await completeAuthentication(req, user.id);

  return userRepository.findById(user.id);
}

async function verifyTotpLogin(req, code) {
  const user = findPendingUser(req);

  if (!user.totp_enabled) {
    throw new AppError(400, 'TOTP_NOT_CONFIGURED', '2FA ainda não configurado. Use /auth/2fa/setup.');
  }

  assertNotLocked(user);

  const secret = decrypt(user.totp_secret_enc);
  const timeStep = await totpService.verifyCode(secret, code, user.last_totp_step);
  if (timeStep === null) registerInvalidCode(user);

  userRepository.updateLastTotpStep(user.id, timeStep);
  userRepository.clearFailedAttempts(user.id);
  await completeAuthentication(req, user.id);
  return user;
}

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
