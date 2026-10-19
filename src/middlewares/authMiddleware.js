// Guardas das rotas, baseadas no estágio gravado na sessão.

const AppError = require('../utils/AppError');
const { STAGES } = require('../services/authService');

// Rotas do 2FA (/auth/2fa/*): só para quem já acertou a senha e ainda não informou o código.
function requirePendingMfa(req, res, next) {
  if (req.session.stage !== STAGES.PASSWORD_OK || !req.session.pendingUserId) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Faça login com e-mail e senha primeiro.'));
  }
  next();
}

module.exports = { requirePendingMfa };
