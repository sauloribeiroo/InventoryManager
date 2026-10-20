// Valida req.body antes de chegar no controller. Campo inválido → 400 VALIDATION_ERROR.
//
// Uso nas rotas:
//   router.post('/login', validateBody({ email: isEmail, password: isRequiredString }), controller.login)
//
// Cada validador recebe o valor do campo e devolve uma mensagem de erro, ou null se estiver ok.

const AppError = require('../utils/AppError');

function validateBody(rules) {
  return (req, res, next) => {
    const body = req.body || {};
    for (const [field, validator] of Object.entries(rules)) {
      const message = validator(body[field]);
      if (message) {
        return next(new AppError(400, 'VALIDATION_ERROR', `${field} ${message}.`));
      }
    }
    next();
  };
}

const isRequiredString = (value) =>
  typeof value === 'string' && value.trim() !== '' ? null : 'é obrigatório';

const isEmail = (value) =>
  typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : 'deve ser um e-mail válido';

const isTotpCode = (value) =>
  typeof value === 'string' && /^\d{6}$/.test(value) ? null : 'deve ter 6 dígitos';

module.exports = { validateBody, isRequiredString, isEmail, isTotpCode };
