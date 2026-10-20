// Guardas das rotas, baseadas no estágio gravado na sessão.

const env = require('../config/env');
const AppError = require('../utils/AppError');
const { STAGES, destroySession } = require('../services/authService');
const userRepository = require('../repositories/userRepository');

const MFA_TTL_MS = env.mfaTtlMinutes * 60 * 1000;

// Rotas do 2FA (/auth/2fa/*): só para quem já acertou a senha e ainda não informou o código.
function requirePendingMfa(req, res, next) {
  if (req.session.stage !== STAGES.PASSWORD_OK || !req.session.pendingUserId) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Faça login com e-mail e senha primeiro.'));
  }
  next();
}

// Rotas protegidas: exige os DOIS fatores e que o 2FA ainda esteja dentro do prazo.
// É async: no Express 5, um erro lançado aqui vai direto para o errorMiddleware.
async function requireAuth(req, res, next) {
  const { stage, userId, mfaVerifiedAt } = req.session;

  // 1. Acertou só a senha → ainda falta o código
  if (stage === STAGES.PASSWORD_OK) {
    throw new AppError(401, 'MFA_REQUIRED', 'Informe o código do autenticador.');
  }

  // 2. Nenhuma sessão válida
  if (stage !== STAGES.AUTHENTICATED || !userId) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Faça login para continuar.');
  }

  // 3. Reautenticação periódica: passado o prazo, a sessão é descartada e o usuário
  //    precisa de senha + novo código (um cookie roubado deixa de valer sozinho)
  if (Date.now() - mfaVerifiedAt > MFA_TTL_MS) {
    await destroySession(req);
    throw new AppError(401, 'MFA_EXPIRED', 'Sua verificação em duas etapas expirou. Faça login novamente.');
  }

  // 4. Lê o usuário do banco a cada requisição: se o admin desativar ou excluir a conta,
  //    o acesso cai na hora, mesmo com a sessão aberta
  const user = userRepository.findById(userId);
  if (!user || !user.active) {
    await destroySession(req);
    throw new AppError(401, 'UNAUTHENTICATED', 'Conta indisponível. Faça login novamente.');
  }

  req.user = user; // controllers e roleMiddleware usam req.user
  next();
}

module.exports = { requirePendingMfa, requireAuth };
