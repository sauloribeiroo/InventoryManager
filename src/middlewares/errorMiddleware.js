// Converte qualquer erro em uma resposta JSON padronizada: { error: { code, message } }.
// O Express 5 encaminha para cá também os erros lançados dentro de funções async.

const AppError = require('../utils/AppError');

function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', `Rota não encontrada: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
  }

  // JSON malformado no corpo da requisição
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Corpo da requisição não é um JSON válido.' } });
  }
    // Corpo maior que o limite do express.json (10 kb)
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Corpo da requisição maior que o permitido (10 kb).' } });
    }
  

  // Erro inesperado: registra no log, mas não expõe detalhes internos ao cliente
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' } });
}

module.exports = { notFound, errorHandler };
