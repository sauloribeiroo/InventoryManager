const { test, describe, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const {
  SENHAS,
  prepararAmbiente,
  instalarApisFalsas,
  restaurarFetch,
  iniciarServidor,
  codigoTotp,
  ativarDoisFatores,
} = require('../helpers/ambiente');

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

const ANA = 'ana@inventory.local';

describe('login: primeiro fator (senha)', () => {
  test('senha correta devolve o próximo passo e cria sessão', async () => {
    const c = servidor.cliente();
    const r = await c.chamar('POST', '/auth/login', { email: ANA, password: SENHAS.tecnico });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.next, 'SETUP_2FA');
    assert.ok(c.cookie.startsWith('sid='));
  });

  test('o e-mail é aceito sem diferenciar maiúsculas de minúsculas', async () => {
    const c = servidor.cliente();
    const r = await c.chamar('POST', '/auth/login', { email: 'ANA@Inventory.Local', password: SENHAS.tecnico });
    assert.equal(r.status, 200);
  });

  test('senha errada → 401 INVALID_CREDENTIALS', async () => {
    const r = await servidor.cliente().chamar('POST', '/auth/login', { email: ANA, password: 'errada123' });
    assert.equal(r.status, 401);
    assert.equal(r.corpo.error.code, 'INVALID_CREDENTIALS');
  });

  test('e-mail inexistente responde exatamente igual a senha errada (não revela quem existe)', async () => {
    const errada = await servidor.cliente().chamar('POST', '/auth/login', { email: ANA, password: 'errada123' });
    const inexistente = await servidor.cliente().chamar('POST', '/auth/login', { email: 'ninguem@inventory.local', password: 'errada123' });
    assert.equal(inexistente.status, errada.status);
    assert.deepEqual(inexistente.corpo, errada.corpo);
  });

  test('login com senha errada não cria cookie de sessão', async () => {
    const r = await servidor.cliente().chamar('POST', '/auth/login', { email: ANA, password: 'errada123' });
    assert.equal(r.cookiesRecebidos.length, 0);
  });

  test('corpo vazio → 400 VALIDATION_ERROR', async () => {
    const r = await servidor.cliente().chamar('POST', '/auth/login');
    assert.equal(r.status, 400);
    assert.equal(r.corpo.error.code, 'VALIDATION_ERROR');
  });

  test('e-mail em formato inválido → 400', async () => {
    const r = await servidor.cliente().chamar('POST', '/auth/login', { email: 'nao-e-email', password: 'x' });
    assert.equal(r.status, 400);
  });

  test('o cookie de sessão é httpOnly, SameSite=Lax e Secure em produção', async () => {
    const c = servidor.cliente();
    const r = await c.chamar('POST', '/auth/login', { email: ANA, password: SENHAS.tecnico });
    const cookie = r.cookiesRecebidos[0];
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Secure/i);
  });
});

describe('só a senha não dá acesso (estágio PASSWORD_OK)', () => {
  test('rota protegida com sessão parcial → 401 MFA_REQUIRED', async () => {
    const c = servidor.cliente();
    await c.chamar('POST', '/auth/login', { email: ANA, password: SENHAS.tecnico });
    for (const rota of ['/auth/me', '/api/equipment', '/api/loans', '/api/users']) {
      const r = await c.chamar('GET', rota);
      assert.equal(r.status, 401, rota);
      assert.equal(r.corpo.error.code, 'MFA_REQUIRED', rota);
    }
  });

  test('rotas do 2FA sem fazer login antes → 401 UNAUTHENTICATED', async () => {
    const c = servidor.cliente();
    assert.equal((await c.chamar('GET', '/auth/2fa/setup')).corpo.error.code, 'UNAUTHENTICATED');
    assert.equal((await c.chamar('POST', '/auth/2fa/verify', { code: '123456' })).status, 401);
    assert.equal((await c.chamar('POST', '/auth/2fa/enable', { code: '123456' })).status, 401);
  });

  test('código com formato inválido → 400 (antes de qualquer verificação)', async () => {
    const c = servidor.cliente();
    await c.chamar('POST', '/auth/login', { email: ANA, password: SENHAS.tecnico });
    const r = await c.chamar('POST', '/auth/2fa/verify', { code: '12' });
    assert.equal(r.status, 400);
  });
});

describe('segundo fator: configuração e verificação (TOTP)', () => {
  const estado = {};

  test('setup devolve QR Code, chave manual e URL otpauth', async () => {
    const c = servidor.cliente();
    estado.cliente = c;
    await c.chamar('POST', '/auth/login', { email: ANA, password: SENHAS.tecnico });
    const r = await c.chamar('GET', '/auth/2fa/setup');
    assert.equal(r.status, 200);
    assert.ok(r.corpo.qrCode.startsWith('data:image/png;base64,'));
    assert.ok(r.corpo.otpauthUrl.startsWith('otpauth://totp/'));
    estado.segredo = r.corpo.manualKey;
  });

  test('enable com código errado → 401 INVALID_TOTP_CODE e o 2FA continua desligado', async () => {
    const r = await estado.cliente.chamar('POST', '/auth/2fa/enable', { code: '000000' });
    assert.equal(r.status, 401);
    assert.equal(r.corpo.error.code, 'INVALID_TOTP_CODE');
    assert.match(r.corpo.error.message, /4 tentativa/);
  });

  test('enable com código certo ativa o 2FA e autentica a sessão', async () => {
    const antes = estado.cliente.cookie;
    const r = await estado.cliente.chamar('POST', '/auth/2fa/enable', { code: await codigoTotp(estado.segredo) });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.user.totp_enabled, true);
    assert.equal(r.corpo.user.email, ANA);
    assert.notEqual(estado.cliente.cookie, antes, 'o ID da sessão deve mudar (session fixation)');
  });

  test('a resposta nunca traz password_hash nem o segredo TOTP', async () => {
    const me = await estado.cliente.chamar('GET', '/auth/me');
    const texto = me.texto;
    assert.ok(!texto.includes('password_hash'));
    assert.ok(!texto.includes('totp_secret'));
    assert.ok(!texto.includes(estado.segredo));
  });

  test('/auth/me devolve o usuário e quando o 2FA expira (30 min)', async () => {
    const r = await estado.cliente.chamar('GET', '/auth/me');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.user.name, 'Ana Souza');
    const minutos = (new Date(r.corpo.mfa_expires_at) - Date.now()) / 60000;
    assert.ok(minutos > 29 && minutos <= 30, `expira em ${minutos} min`);
  });

  test('o segredo fica cifrado no banco e a senha fica em hash bcrypt', () => {
    const db = new DatabaseSync(process.env.DATABASE_PATH);
    const usuario = db.prepare('SELECT password_hash, totp_secret_enc, totp_enabled FROM users WHERE email = ?').get(ANA);
    db.close();
    assert.equal(usuario.totp_enabled, 1);
    assert.ok(!usuario.totp_secret_enc.includes(estado.segredo));
    assert.equal(usuario.totp_secret_enc.split(':').length, 3);
    assert.ok(usuario.password_hash.startsWith('$2'));
    assert.ok(!usuario.password_hash.includes(SENHAS.tecnico));
  });

  test('sessão autenticada acessa rota protegida; setup depois de autenticado é recusado', async () => {
    assert.equal((await estado.cliente.chamar('GET', '/api/equipment')).status, 200);
    assert.equal((await estado.cliente.chamar('GET', '/auth/2fa/setup')).status, 401);
  });

  test('logout encerra a sessão: o cookie antigo deixa de valer', async () => {
    const cookieAntigo = estado.cliente.cookie;
    const r = await estado.cliente.chamar('POST', '/auth/logout');
    assert.equal(r.status, 200);

    const outro = servidor.cliente();
    outro.usarCookie(cookieAntigo);
    const depois = await outro.chamar('GET', '/auth/me');
    assert.equal(depois.status, 401);
    assert.equal(depois.corpo.error.code, 'UNAUTHENTICATED');
  });

  test('acessos seguintes: login pede VERIFY_2FA e recusa novo setup (409)', async () => {
    const c = servidor.cliente();
    estado.segundo = c;
    const login = await c.chamar('POST', '/auth/login', { email: ANA, password: SENHAS.tecnico });
    assert.equal(login.corpo.next, 'VERIFY_2FA');
    const setup = await c.chamar('GET', '/auth/2fa/setup');
    assert.equal(setup.status, 409);
    assert.equal(setup.corpo.error.code, 'TOTP_ALREADY_ENABLED');
  });

  test('anti-replay: o código já usado no enable é recusado no verify', async () => {
    const r = await estado.segundo.chamar('POST', '/auth/2fa/verify', { code: await codigoTotp(estado.segredo, 0) });
    assert.equal(r.status, 401);
    assert.equal(r.corpo.error.code, 'INVALID_TOTP_CODE');
  });

  test('código novo (passo seguinte) é aceito e autentica', async () => {
    const antes = estado.segundo.cookie;
    const r = await estado.segundo.chamar('POST', '/auth/2fa/verify', { code: await codigoTotp(estado.segredo, 1) });
    assert.equal(r.status, 200);
    assert.notEqual(estado.segundo.cookie, antes);
    assert.equal((await estado.segundo.chamar('GET', '/api/loans')).status, 200);
  });
});

describe('expiração do 2FA (MFA_TTL_MINUTES)', () => {
  test('passados 30 min, a sessão cai com 401 MFA_EXPIRED e é destruída', async () => {
    const c = servidor.cliente();
    await ativarDoisFatores(c, 'bruno@inventory.local', SENHAS.tecnico);
    assert.equal((await c.chamar('GET', '/api/equipment')).status, 200);

    const relogioReal = Date.now;
    mock.method(Date, 'now', () => relogioReal() + 31 * 60 * 1000);
    const expirada = await c.chamar('GET', '/api/equipment');
    mock.restoreAll();

    assert.equal(expirada.status, 401);
    assert.equal(expirada.corpo.error.code, 'MFA_EXPIRED');

    const depois = await c.chamar('GET', '/api/equipment');
    assert.equal(depois.corpo.error.code, 'UNAUTHENTICATED');
  });
});

describe('bloqueio da conta por códigos errados', () => {
  test('4 erros avisam quantas tentativas restam; o 5º bloqueia a conta com 423', async () => {
    const { segredo } = await ativarDoisFatores(servidor.cliente(), 'carla@inventory.local', SENHAS.tecnico);
    assert.ok(segredo);

    const c = servidor.cliente();
    await c.chamar('POST', '/auth/login', { email: 'carla@inventory.local', password: SENHAS.tecnico });

    for (let restantes = 4; restantes >= 1; restantes -= 1) {
      const r = await c.chamar('POST', '/auth/2fa/verify', { code: '000000' });
      assert.equal(r.status, 401);
      assert.match(r.corpo.error.message, new RegExp(`${restantes} tentativa`));
    }

    const quinto = await c.chamar('POST', '/auth/2fa/verify', { code: '000000' });
    assert.equal(quinto.status, 423);
    assert.equal(quinto.corpo.error.code, 'ACCOUNT_LOCKED');
  });

  test('conta bloqueada não consegue nem passar da senha (423)', async () => {
    const r = await servidor.cliente().chamar('POST', '/auth/login', { email: 'carla@inventory.local', password: SENHAS.tecnico });
    assert.equal(r.status, 423);
    assert.equal(r.corpo.error.code, 'ACCOUNT_LOCKED');
  });

  test('o bloqueio fica registrado no banco com data futura', () => {
    const db = new DatabaseSync(process.env.DATABASE_PATH);
    const { locked_until } = db.prepare('SELECT locked_until FROM users WHERE email = ?').get('carla@inventory.local');
    db.close();
    assert.ok(new Date(locked_until) > new Date());
  });
});
