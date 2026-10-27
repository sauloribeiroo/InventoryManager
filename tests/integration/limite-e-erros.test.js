const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararAmbiente, instalarApisFalsas, restaurarFetch, iniciarServidor } = require('../helpers/ambiente');

let servidor;

before(async () => {
  prepararAmbiente();
  instalarApisFalsas();
  servidor = await iniciarServidor();
});

after(async () => {
  restaurarFetch();
  await servidor.fechar();
});

describe('rate limiting', () => {
  test('login: depois de 10 tentativas a mesma origem recebe 429 TOO_MANY_REQUESTS', async () => {
    const c = servidor.cliente();
    const corpo = { email: 'ana@inventory.local', password: 'errada123' };
    for (let i = 0; i < 10; i += 1) {
      assert.equal((await c.chamar('POST', '/auth/login', corpo)).status, 401, `tentativa ${i + 1}`);
    }
    const bloqueada = await c.chamar('POST', '/auth/login', corpo);
    assert.equal(bloqueada.status, 429);
    assert.equal(bloqueada.corpo.error.code, 'TOO_MANY_REQUESTS');
  });

  test('o limite é por origem: outro cliente continua podendo tentar', async () => {
    const outro = servidor.cliente();
    const r = await outro.chamar('POST', '/auth/login', { email: 'ana@inventory.local', password: 'errada123' });
    assert.equal(r.status, 401);
  });

  test('2FA: depois de 10 tentativas na rota de verificação → 429', async () => {
    const c = servidor.cliente();
    for (let i = 0; i < 10; i += 1) {
      await c.chamar('POST', '/auth/2fa/verify', { code: '123456' });
    }
    const r = await c.chamar('POST', '/auth/2fa/verify', { code: '123456' });
    assert.equal(r.status, 429);
  });

  test('a resposta traz os cabeçalhos de limite (RateLimit)', async () => {
    const r = await servidor.cliente().chamar('POST', '/auth/login', { email: 'a@b.co', password: 'x' });
    const cabecalhos = [...r.cabecalhos.keys()].join(' ');
    assert.match(cabecalhos, /ratelimit/i);
  });
});

describe('tratamento de erros', () => {
  test('rota inexistente → 404 NOT_FOUND no formato padrão', async () => {
    const r = await servidor.cliente().chamar('GET', '/api/nao-existe');
    assert.equal(r.status, 404);
    assert.equal(r.corpo.error.code, 'NOT_FOUND');
  });

  test('JSON malformado → 400 INVALID_JSON', async () => {
    const r = await servidor.cliente().chamar('POST', '/auth/2fa/verify', '{"code": ', { 'Content-Type': 'application/json' });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.error.code, 'INVALID_JSON');
  });

  test('corpo acima de 10 kb → 413 PAYLOAD_TOO_LARGE', async () => {
    const r = await servidor.cliente().chamar('POST', '/auth/2fa/verify', { code: 'x'.repeat(20000) });
    assert.equal(r.status, 413);
    assert.equal(r.corpo.error.code, 'PAYLOAD_TOO_LARGE');
  });

  test('todo erro segue o formato { error: { code, message } }', async () => {
    const c = servidor.cliente();
    const respostas = [
      await c.chamar('GET', '/api/equipment'),
      await c.chamar('GET', '/rota-inexistente'),
      await c.chamar('POST', '/auth/logout').then(() => c.chamar('GET', '/auth/me')),
    ];
    for (const r of respostas) {
      assert.deepEqual(Object.keys(r.corpo), ['error']);
      assert.deepEqual(Object.keys(r.corpo.error).sort(), ['code', 'message']);
    }
  });
});

describe('cabeçalhos de segurança e arquivos estáticos', () => {
  test('helmet: CSP, nosniff, anti-clickjacking e HSTS', async () => {
    const r = await servidor.cliente().chamar('GET', '/');
    assert.match(r.cabecalhos.get('content-security-policy'), /default-src 'self'/);
    assert.equal(r.cabecalhos.get('x-content-type-options'), 'nosniff');
    assert.ok(r.cabecalhos.get('x-frame-options'));
    assert.ok(r.cabecalhos.get('strict-transport-security'));
    assert.equal(r.cabecalhos.get('x-powered-by'), null);
  });

  test('o front-end é servido: login, 2FA, admin e estoque', async () => {
    const c = servidor.cliente();
    for (const pagina of ['/', '/setup-2fa.html', '/verify-2fa.html', '/admin.html', '/inventory.html', '/css/style.css', '/js/api.js']) {
      const r = await c.chamar('GET', pagina);
      assert.equal(r.status, 200, pagina);
    }
  });

  test('o HTML não carrega scripts inline (compatível com a CSP)', async () => {
    const r = await servidor.cliente().chamar('GET', '/');
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(r.texto));
  });

  test('GET /health responde ok sem autenticação', async () => {
    const r = await servidor.cliente().chamar('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.status, 'ok');
  });
});
