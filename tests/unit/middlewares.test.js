const { test, describe, mock } = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../src/utils/AppError');
const { requireRole } = require('../../src/middlewares/roleMiddleware');
const { notFound, errorHandler } = require('../../src/middlewares/errorMiddleware');

function respostaFalsa() {
  const res = { statusCode: null, corpo: null };
  res.status = (codigo) => {
    res.statusCode = codigo;
    return res;
  };
  res.json = (corpo) => {
    res.corpo = corpo;
    return res;
  };
  return res;
}

describe('requireRole', () => {
  test('libera o papel permitido', () => {
    let erro = 'não chamou';
    requireRole('admin')({ user: { role: 'admin' } }, {}, (e) => {
      erro = e;
    });
    assert.equal(erro, undefined);
  });

  test('papel não permitido gera 403 FORBIDDEN', () => {
    let erro;
    requireRole('admin')({ user: { role: 'technician' } }, {}, (e) => {
      erro = e;
    });
    assert.equal(erro.statusCode, 403);
    assert.equal(erro.code, 'FORBIDDEN');
  });

  test('aceita mais de um papel', () => {
    let erro = 'não chamou';
    requireRole('admin', 'technician')({ user: { role: 'technician' } }, {}, (e) => {
      erro = e;
    });
    assert.equal(erro, undefined);
  });
});

describe('errorMiddleware', () => {
  test('AppError vira { error: { code, message } } com o status dele', () => {
    const res = respostaFalsa();
    errorHandler(new AppError(409, 'CONFLICT', 'conflito'), {}, res, () => {});
    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.corpo, { error: { code: 'CONFLICT', message: 'conflito' } });
  });

  test('JSON malformado vira 400 INVALID_JSON', () => {
    const res = respostaFalsa();
    errorHandler(Object.assign(new Error('x'), { type: 'entity.parse.failed' }), {}, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.equal(res.corpo.error.code, 'INVALID_JSON');
  });

  test('corpo grande demais vira 413 PAYLOAD_TOO_LARGE', () => {
    const res = respostaFalsa();
    errorHandler(Object.assign(new Error('x'), { type: 'entity.too.large' }), {}, res, () => {});
    assert.equal(res.statusCode, 413);
    assert.equal(res.corpo.error.code, 'PAYLOAD_TOO_LARGE');
  });

  test('erro desconhecido vira 500 genérico, sem vazar a mensagem interna', () => {
    mock.method(console, 'error', () => {});
    const res = respostaFalsa();
    errorHandler(new Error('detalhe interno secreto'), {}, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.corpo.error.code, 'INTERNAL_ERROR');
    assert.ok(!JSON.stringify(res.corpo).includes('secreto'));
  });

  test('notFound cria 404 citando método e rota', () => {
    let erro;
    notFound({ method: 'GET', originalUrl: '/nada' }, {}, (e) => {
      erro = e;
    });
    assert.equal(erro.statusCode, 404);
    assert.match(erro.message, /GET \/nada/);
  });
});
