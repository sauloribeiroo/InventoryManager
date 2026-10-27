const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateBody,
  isRequiredString,
  isEmail,
  isTotpCode,
  isStrongPassword,
  isBoolean,
  isOneOf,
  isIntegerBetween,
  optional,
} = require('../../src/middlewares/validateMiddleware');

describe('validadores de campo (null = válido)', () => {
  test('isRequiredString recusa vazio, só espaços e não-texto', () => {
    assert.equal(isRequiredString('Ana'), null);
    assert.notEqual(isRequiredString(''), null);
    assert.notEqual(isRequiredString('   '), null);
    assert.notEqual(isRequiredString(undefined), null);
    assert.notEqual(isRequiredString(123), null);
  });

  test('isEmail', () => {
    assert.equal(isEmail('ana@inventory.local'), null);
    for (const ruim of ['ana', 'ana@', '@x.com', 'ana@x', 'a na@x.com', undefined, 42]) {
      assert.notEqual(isEmail(ruim), null, String(ruim));
    }
  });

  test('isTotpCode exige exatamente 6 dígitos em texto', () => {
    assert.equal(isTotpCode('123456'), null);
    for (const ruim of ['12345', '1234567', 'abcdef', '12 456', 123456, undefined]) {
      assert.notEqual(isTotpCode(ruim), null, String(ruim));
    }
  });

  test('isStrongPassword exige 8+ caracteres com letra e número', () => {
    assert.equal(isStrongPassword('Senha123'), null);
    for (const ruim of ['curta1', 'somenteletras', '12345678', undefined, 12345678]) {
      assert.notEqual(isStrongPassword(ruim), null, String(ruim));
    }
  });

  test('isBoolean só aceita true/false de verdade', () => {
    assert.equal(isBoolean(true), null);
    assert.equal(isBoolean(false), null);
    assert.notEqual(isBoolean('true'), null);
    assert.notEqual(isBoolean(1), null);
  });

  test('isOneOf lista os valores permitidos na mensagem', () => {
    const validador = isOneOf(['admin', 'technician']);
    assert.equal(validador('admin'), null);
    assert.match(validador('root'), /admin, technician/);
  });

  test('isIntegerBetween respeita os limites e recusa decimais', () => {
    const validador = isIntegerBetween(1, 30);
    assert.equal(validador(1), null);
    assert.equal(validador(30), null);
    for (const ruim of [0, 31, 2.5, '5', undefined]) {
      assert.notEqual(validador(ruim), null, String(ruim));
    }
  });

  test('optional aceita campo ausente, mas valida se vier', () => {
    const validador = optional(isEmail);
    assert.equal(validador(undefined), null);
    assert.equal(validador('a@b.co'), null);
    assert.notEqual(validador('ruim'), null);
  });
});

describe('validateBody', () => {
  function executar(regras, req) {
    let recebido;
    validateBody(regras)(req, {}, (erro) => {
      recebido = erro;
    });
    return recebido;
  }

  test('corpo válido segue adiante sem erro', () => {
    assert.equal(executar({ code: isTotpCode }, { body: { code: '123456' } }), undefined);
  });

  test('campo inválido gera AppError 400 VALIDATION_ERROR citando o campo', () => {
    const erro = executar({ code: isTotpCode }, { body: { code: '1' } });
    assert.equal(erro.statusCode, 400);
    assert.equal(erro.code, 'VALIDATION_ERROR');
    assert.match(erro.message, /^code /);
  });

  test('requisição sem corpo (req.body undefined) vira objeto e não quebra', () => {
    const req = {};
    const erro = executar({ name: optional(isRequiredString) }, req);
    assert.equal(erro, undefined);
    assert.deepEqual(req.body, {});
  });

  test('requisição sem corpo com campo obrigatório dá 400, não erro interno', () => {
    const erro = executar({ email: isEmail }, {});
    assert.equal(erro.statusCode, 400);
  });
});
