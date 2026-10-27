const env = require('../config/env');
const AppError = require('../utils/AppError');
const { STAGES, destroySession } = require('../services/authService');
const userRepository = require('../repositories/userRepository');

const MFA_TTL_MS = env.mfaTtlMinutes * 60 * 1000;

function requirePendingMfa(req, res, next) {
  if (req.session.stage !== STAGES.PASSWORD_OK || !req.session.pendingUserId) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Faça login com e-mail e senha primeiro.'));
  }
  next();
}

async function requireAuth(req, res, next) {
  const { stage, userId, mfaVerifiedAt } = req.session;

  if (stage === STAGES.PASSWORD_OK) {
    throw new AppError(401, 'MFA_REQUIRED', 'Informe o código do autenticador.');
  }

  if (stage !== STAGES.AUTHENTICATED || !userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
  }

  if (Date.now() - mfaVerifiedAt > MFA_TTL_MS) {
    await destroySession(req);
    throw new AppError(401, 'MFA_EXPIRED', 'Sua verificação em duas etapas expirou. Faça login novamente.');
  }

  const user = userRepository.findById(userId);
  if (!user || !user.active) {
    await destroySession(req);
    throw new AppError(401, 'UNAUTHENTICATED', 'Conta indisponível. Faça login novamente.');
  }

  req.user = user;
  next();
}

module.exports = { requirePendingMfa, requireAuth };
