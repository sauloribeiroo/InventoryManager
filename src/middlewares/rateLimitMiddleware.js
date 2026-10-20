// Rate limiting por IP nas rotas de autenticação (proteção contra força bruta e abuso).
// Estourou o limite → 429 Too Many Requests, no mesmo formato JSON dos outros erros.

const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

function createLimiter({ windowMinutes, limit }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8', // informa o limite e o tempo restante no header RateLimit
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new AppError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas. Aguarde e tente novamente.')),
  });
}

// Senha: 10 tentativas a cada 15 minutos por IP
const loginLimiter = createLimiter({ windowMinutes: 15, limit: 10 });

// Código 2FA: 10 tentativas a cada 5 minutos por IP
// (somado ao bloqueio da conta após 5 códigos errados, no authService)
const mfaLimiter = createLimiter({ windowMinutes: 5, limit: 10 });

module.exports = { loginLimiter, mfaLimiter };
