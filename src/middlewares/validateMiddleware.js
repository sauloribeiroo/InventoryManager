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
    req.body = body // express 5: sem corpo, req.body vem undefined; garante um objeto
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

// Senha inicial criada pelo admin: mínimo 8 caracteres, com letra e número
const isStrongPassword = (value) =>
  typeof value === 'string' && value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value)
    ? null
    : 'deve ter ao menos 8 caracteres, com letras e números';

const isBoolean = (value) => (typeof value === 'boolean' ? null : 'deve ser true ou false');

const isOneOf = (allowed) => (value) => (allowed.includes(value) ? null : `deve ser um destes: ${allowed.join(', ')}`);

const isIntegerBetween = (min, max) => (value) =>
  Number.isInteger(value) && value >= min && value <= max ? null : `deve ser um número inteiro entre ${min} e ${max}`;

// Torna um validador opcional: campo ausente passa; se vier, é validado (usado no PUT)
const optional = (validator) => (value) => (value === undefined ? null : validator(value));

module.exports = {
  validateBody,
  isRequiredString,
  isEmail,
  isTotpCode,
  isStrongPassword,
  isBoolean,
  isOneOf,
  isIntegerBetween,
  optional,
};
