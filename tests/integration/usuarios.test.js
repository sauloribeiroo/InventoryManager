const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  SENHAS,
  prepararAmbiente,
  instalarApisFalsas,
  restaurarFetch,
  iniciarServidor,
  ativarDoisFatores,
} = require('../helpers/ambiente');

let servidor;
let admin;
let tecnico;
let novoId;

before(async () => {
  prepararAmbiente();
  instalarApisFalsas();
  servidor = await iniciarServidor();
  admin = servidor.cliente();
  tecnico = servidor.cliente();
  await ativarDoisFatores(admin, 'admin@inventory.local', SENHAS.admin);
  await ativarDoisFatores(tecnico, 'ana@inventory.local', SENHAS.tecnico);
});

after(async () => {
  restaurarFetch();
  await servidor.fechar();
});

const NOVO = { name: 'Diego Alves', email: 'diego@inventory.local', password: 'Senha1234', role: 'technician' };

describe('permissões: rotas de administrador (/api/users)', () => {
  test('sem sessão → 401 em todas as rotas', async () => {
    const anonimo = servidor.cliente();
    for (const [metodo, rota] of [['GET', '/api/users'], ['GET', '/api/users/1'], ['POST', '/api/users'], ['PUT', '/api/users/1'], ['DELETE', '/api/users/1'], ['POST', '/api/users/1/reset-2fa']]) {
      const r = await anonimo.chamar(metodo, rota);
      assert.equal(r.status, 401, `${metodo} ${rota}`);
    }
  });

  test('técnico → 403 FORBIDDEN em todas as rotas', async () => {
    for (const [metodo, rota] of [['GET', '/api/users'], ['GET', '/api/users/1'], ['POST', '/api/users'], ['PUT', '/api/users/1'], ['DELETE', '/api/users/1'], ['POST', '/api/users/1/reset-2fa']]) {
      const r = await tecnico.chamar(metodo, rota);
      assert.equal(r.status, 403, `${metodo} ${rota}`);
      assert.equal(r.corpo.error.code, 'FORBIDDEN');
    }
  });

  test('admin lista as contas sem expor senha nem segredo TOTP', async () => {
    const r = await admin.chamar('GET', '/api/users');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.length, 4);
    assert.ok(!r.texto.includes('password_hash'));
    assert.ok(!r.texto.includes('totp_secret'));
    assert.deepEqual(Object.keys(r.corpo[0]).sort(), ['active', 'created_at', 'email', 'id', 'name', 'role', 'totp_enabled']);
  });

  test('admin detalha uma conta; id inexistente → 404', async () => {
    assert.equal((await admin.chamar('GET', '/api/users/2')).corpo.email, 'ana@inventory.local');
    const r = await admin.chamar('GET', '/api/users/999');
    assert.equal(r.status, 404);
    assert.equal(r.corpo.error.code, 'NOT_FOUND');
  });
});

describe('admin cria e edita contas', () => {
  test('cria conta → 201, sem expor a senha, com 2FA desligado', async () => {
    const r = await admin.chamar('POST', '/api/users', NOVO);
    assert.equal(r.status, 201);
    assert.equal(r.corpo.role, 'technician');
    assert.equal(r.corpo.totp_enabled, false);
    assert.equal(r.corpo.active, true);
    assert.ok(!r.texto.includes('Senha1234'));
    novoId = r.corpo.id;
  });

  test('a conta criada consegue fazer login e cai na configuração do 2FA', async () => {
    const r = await servidor.cliente().chamar('POST', '/auth/login', { email: NOVO.email, password: NOVO.password });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.next, 'SETUP_2FA');
  });

  test('e-mail repetido → 409 CONFLICT', async () => {
    const r = await admin.chamar('POST', '/api/users', NOVO);
    assert.equal(r.status, 409);
    assert.equal(r.corpo.error.code, 'CONFLICT');
  });

  test('validação do cadastro → 400 (senha fraca, e-mail ruim, papel inválido, nome vazio)', async () => {
    const base = { ...NOVO, email: 'outro@inventory.local' };
    for (const campo of [{ password: 'curta1' }, { password: 'semnumeros' }, { email: 'ruim' }, { role: 'root' }, { name: '  ' }]) {
      const r = await admin.chamar('POST', '/api/users', { ...base, ...campo });
      assert.equal(r.status, 400, JSON.stringify(campo));
      assert.equal(r.corpo.error.code, 'VALIDATION_ERROR');
    }
  });

  test('edita nome; as demais informações continuam', async () => {
    const r = await admin.chamar('PUT', `/api/users/${novoId}`, { name: 'Diego A. Alves' });
    assert.equal(r.status, 200);
    assert.equal(r.corpo.name, 'Diego A. Alves');
    assert.equal(r.corpo.email, NOVO.email);
  });

  test('PUT sem corpo não dá erro 500', async () => {
    const r = await admin.chamar('PUT', `/api/users/${novoId}`);
    assert.equal(r.status, 200);
  });

  test('trocar para e-mail de outra conta → 409', async () => {
    const r = await admin.chamar('PUT', `/api/users/${novoId}`, { email: 'ana@inventory.local' });
    assert.equal(r.status, 409);
  });

  test('o admin não pode desativar, rebaixar nem excluir a si mesmo (400)', async () => {
    const desativar = await admin.chamar('PUT', '/api/users/1', { active: false });
    const rebaixar = await admin.chamar('PUT', '/api/users/1', { role: 'technician' });
    const excluir = await admin.chamar('DELETE', '/api/users/1');
    for (const r of [desativar, rebaixar, excluir]) {
      assert.equal(r.status, 400);
      assert.equal(r.corpo.error.code, 'SELF_ACTION_NOT_ALLOWED');
    }
  });

  test('conta com empréstimos não pode ser excluída (409)', async () => {
    const r = await admin.chamar('DELETE', '/api/users/2');
    assert.equal(r.status, 409);
  });
});

describe('desativar, resetar 2FA e excluir', () => {
  test('conta desativada não consegue entrar → 403 ACCOUNT_DISABLED', async () => {
    const alterar = await admin.chamar('PUT', `/api/users/${novoId}`, { active: false });
    assert.equal(alterar.corpo.active, false);
    const r = await servidor.cliente().chamar('POST', '/auth/login', { email: NOVO.email, password: NOVO.password });
    assert.equal(r.status, 403);
    assert.equal(r.corpo.error.code, 'ACCOUNT_DISABLED');
  });

  test('desativar derruba a sessão que já estava aberta, na hora', async () => {
    const bruno = servidor.cliente();
    await ativarDoisFatores(bruno, 'bruno@inventory.local', SENHAS.tecnico);
    assert.equal((await bruno.chamar('GET', '/api/equipment')).status, 200);

    await admin.chamar('PUT', '/api/users/3', { active: false });
    const r = await bruno.chamar('GET', '/api/equipment');
    assert.equal(r.status, 401);
    assert.equal(r.corpo.error.code, 'UNAUTHENTICATED');
  });

  test('reset do 2FA volta a conta para o primeiro acesso', async () => {
    const r = await admin.chamar('POST', '/api/users/2/reset-2fa');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.user.totp_enabled, false);

    const login = await servidor.cliente().chamar('POST', '/auth/login', { email: 'ana@inventory.local', password: SENHAS.tecnico });
    assert.equal(login.corpo.next, 'SETUP_2FA');
  });

  test('reset de conta inexistente → 404', async () => {
    assert.equal((await admin.chamar('POST', '/api/users/999/reset-2fa')).status, 404);
  });

  test('exclui conta sem empréstimos → 204 e depois 404', async () => {
    const r = await admin.chamar('DELETE', `/api/users/${novoId}`);
    assert.equal(r.status, 204);
    assert.equal((await admin.chamar('GET', `/api/users/${novoId}`)).status, 404);
  });

  test('excluir conta inexistente → 404', async () => {
    assert.equal((await admin.chamar('DELETE', '/api/users/999')).status, 404);
  });

  test('conta excluída com sessão aberta perde o acesso na hora', async () => {
    const criada = await admin.chamar('POST', '/api/users', { ...NOVO, email: 'temp@inventory.local' });
    const temp = servidor.cliente();
    await ativarDoisFatores(temp, 'temp@inventory.local', NOVO.password);
    assert.equal((await temp.chamar('GET', '/api/equipment')).status, 200);

    await admin.chamar('DELETE', `/api/users/${criada.corpo.id}`);
    assert.equal((await temp.chamar('GET', '/api/equipment')).status, 401);
  });
});
