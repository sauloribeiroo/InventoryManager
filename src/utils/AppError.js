// Erro "esperado" da aplicação: carrega o status HTTP e um código legível.
// Ex.: throw new AppError(401, 'MFA_EXPIRED', 'Sua verificação expirou.')

class AppError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = AppError;
