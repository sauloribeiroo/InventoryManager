const rateLimit = require('express-rate-limit');
const AppError = require('../utils/AppError');

function createLimiter({ windowMinutes, limit }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) =>
      next(new AppError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas. Aguarde e tente novamente.')),
  });
}

const loginLimiter = createLimiter({ windowMinutes: 15, limit: 10 });

const mfaLimiter = createLimiter({ windowMinutes: 5, limit: 10 });

module.exports = { loginLimiter, mfaLimiter };
