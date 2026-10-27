const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const {
  RAIZ,
  SENHAS,
  prepararAmbiente,
  instalarApisFalsas,
  restaurarFetch,
  iniciarServidor,
  ativarDoisFatores,
} = require('../helpers/ambiente');

let servidor;
let apis;
let db;
let ana;
let admin;

before(async () => {
  prepararAmbiente();
  apis = instalarApisFalsas({ cotacao: 5 });
  servidor = await iniciarServidor();
  db = new DatabaseSync(process.env.DATABASE_PATH);
  ana = servidor.cliente();
  admin = servidor.cliente();
  await ativarDoisFatores(ana, 'ana@inventory.local', SENHAS.tecnico);
  await ativarDoisFatores(admin, 'admin@inventory.local', SENHAS.admin);
});

after(async () => {
  db.close();
  restaurarFetch();
  await servidor.fechar();
});

function colunas(tabela) {
  return db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name);
}

describe('PDF, Etapa 1: tipo de autenticação', () => {
  test('não usa Basic Auth, Bearer Token nem API Key: não existe header Authorization nem chave de API', async () => {
    const r = await ana.chamar('GET', '/api/equipment', undefined, { Authorization: 'Bearer qualquer-coisa' });
    assert.equal(r.status, 200, 'o header Authorization é ignorado: quem vale é a sessão');

    const anonimo = servidor.cliente();
    const basic = await anonimo.chamar('GET', '/api/equipment', undefined, {
      Authorization: `Basic ${Buffer.from(`ana@inventory.local:${SENHAS.tecnico}`).toString('base64')}`,
    });
    assert.equal(basic.status, 401, 'Basic Auth não autentica');

    const chave = await anonimo.chamar('GET', '/api/equipment', undefined, { 'x-api-key': 'abc' });
    assert.equal(chave.status, 401, 'API Key não autentica');
    const chaveNaUrl = await anonimo.chamar('GET', '/api/equipment?api_key=abc');
    assert.equal(chaveNaUrl.status, 401);
  });

  test('a autenticação exige dois fatores: senha + código TOTP', async () => {
    const c = servidor.cliente();
    await c.chamar('POST', '/auth/login', { email: 'bruno@inventory.local', password: SENHAS.tecnico });
    assert.equal((await c.chamar('GET', '/api/equipment')).status, 401);
  });
});

describe('PDF, Etapa 2: o sistema', () => {
  test('pelo menos 2 recursos principais, cada um com 7 ou mais campos', () => {
    const recursos = { users: colunas('users'), equipment: colunas('equipment'), loans: colunas('loans') };
    for (const [nome, campos] of Object.entries(recursos)) {
      assert.ok(campos.length >= 7, `${nome} tem ${campos.length} campos`);
    }
  });

  test('pelo menos 3 registros populados em cada recurso', () => {
    for (const tabela of ['users', 'equipment', 'loans']) {
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM ${tabela}`).get();
      assert.ok(total >= 3, `${tabela} tem ${total} registros`);
    }
  });

  test('múltiplos tipos de usuário com permissões diferentes (admin e técnico)', () => {
    const papeis = db.prepare('SELECT DISTINCT role FROM users ORDER BY role').all().map((l) => l.role);
    assert.deepEqual(papeis, ['admin', 'technician']);
  });

  test('dados protegidos: senha só em hash e segredo TOTP cifrado', () => {
    const usuarios = db.prepare('SELECT password_hash, totp_secret_enc FROM users').all();
    for (const u of usuarios) {
      assert.ok(u.password_hash.startsWith('$2'));
      if (u.totp_secret_enc) assert.equal(u.totp_secret_enc.split(':').length, 3);
    }
  });
});

describe('PDF, Etapa 2: a API', () => {
  test('endpoint de autenticação: login e logout existem e funcionam', async () => {
    const c = servidor.cliente();
    const login = await c.chamar('POST', '/auth/login', { email: 'carla@inventory.local', password: SENHAS.tecnico });
    assert.equal(login.status, 200);
    const logout = await c.chamar('POST', '/auth/logout');
    assert.equal(logout.status, 200);
  });

  test('pelo menos 3 endpoints protegidos: todos negam acesso sem sessão (401)', async () => {
    const anonimo = servidor.cliente();
    const protegidos = [
      ['GET', '/auth/me'],
      ['GET', '/api/users'],
      ['GET', '/api/equipment'],
      ['GET', '/api/loans'],
      ['POST', '/api/loans'],
      ['PATCH', '/api/loans/1/return'],
      ['POST', '/api/users'],
    ];
    assert.ok(protegidos.length >= 3);
    for (const [metodo, rota] of protegidos) {
      assert.equal((await anonimo.chamar(metodo, rota)).status, 401, `${metodo} ${rota}`);
    }
  });

  test('validação de permissões por tipo de usuário: 403 cruzado entre admin e técnico', async () => {
    assert.equal((await ana.chamar('GET', '/api/users')).status, 403);
    assert.equal((await admin.chamar('GET', '/api/equipment')).status, 403);
    assert.equal((await admin.chamar('GET', '/api/users')).status, 200);
    assert.equal((await ana.chamar('GET', '/api/equipment')).status, 200);
  });

  test('tratamento de erros apropriado: 400, 401, 403, 404, 409, 423 e 429 já cobertos pela suíte', async () => {
    assert.equal((await ana.chamar('POST', '/api/loans', {})).status, 400);
    assert.equal((await servidor.cliente().chamar('GET', '/api/loans')).status, 401);
    assert.equal((await admin.chamar('GET', '/api/loans')).status, 403);
    assert.equal((await ana.chamar('GET', '/api/equipment/999')).status, 404);
    assert.equal((await ana.chamar('POST', '/api/loans', { equipment_id: 1, borrower_name: 'x', destination_department: 'y', business_days: 2 })).status, 409);
  });

  test('segurança: rate limiting, validação de entrada e senha em hash estão ativos', async () => {
    const r = await servidor.cliente().chamar('POST', '/auth/login', { email: 'ruim', password: '' });
    assert.equal(r.status, 400);
    const limite = await servidor.cliente().chamar('POST', '/auth/login', { email: 'a@b.co', password: 'x' });
    assert.ok([...limite.cabecalhos.keys()].some((k) => /ratelimit/i.test(k)));
  });
});

describe('PDF, Etapa 2: integração com API externa', () => {
  test('pelo menos 2 requisições a APIs externas, combinadas com os dados locais', async () => {
    const antesCotacao = apis.chamadas.cotacao.length;
    const antesFeriados = apis.chamadas.feriados.length;

    const estoque = await ana.chamar('GET', '/api/equipment/2');
    assert.equal(estoque.corpo.value_usd, 2399);
    assert.equal(estoque.corpo.value_brl, 2399 * 5, 'dado local (USD) combinado com a cotação externa');

    const emprestimo = await ana.chamar('POST', '/api/loans', { equipment_id: 2, borrower_name: 'Teste', destination_department: 'TI', business_days: 2 });
    assert.equal(emprestimo.status, 201);
    assert.equal(emprestimo.corpo.holidays_checked, true, 'dado local (prazo) combinado com os feriados externos');

    assert.ok(apis.chamadas.cotacao.length + antesCotacao >= 1);
    assert.ok(apis.chamadas.feriados.length + antesFeriados >= 1);
    const distintas = new Set([...apis.chamadas.cotacao, ...apis.chamadas.feriados].map((u) => new URL(u).host));
    assert.ok(distintas.size >= 2, 'duas APIs externas diferentes');
  });
});

describe('PDF, Etapas 3 e 4: repositório e documentação', () => {
  const readme = fs.readFileSync(path.join(RAIZ, 'README.md'), 'utf8');

  test('README tem as seções exigidas pelo enunciado', () => {
    const exigidas = [
      /Sobre o sistema/i,
      /Casos de uso/i,
      /Tipos de usuário e permissões/i,
      /Dados gerenciados/i,
      /Como funciona, passo a passo/i,
      /Por que escolhemos/i,
      /Pontos fortes/i,
      /Pontos fracos/i,
      /Implementação/i,
      /### Segurança/i,
      /Como rodar localmente/i,
      /Variáveis de ambiente/i,
      /Endpoints e exemplos de requisição/i,
      /Exemplos de erro/i,
      /Integração com APIs externas/i,
      /Como fazer o deploy/i,
      /Como testar online/i,
      /Equipe/i,
    ];
    for (const secao of exigidas) assert.match(readme, secao, String(secao));
  });

  test('README documenta exemplos curl e códigos 401, 403, 409, 423 e 429', () => {
    assert.match(readme, /curl /);
    for (const codigo of ['**401**', '**403**', '**409**', '**423**', '**429**']) assert.ok(readme.includes(codigo), codigo);
  });

  test('toda variável de ambiente do código está documentada no README e no .env.example', () => {
    const exemplo = fs.readFileSync(path.join(RAIZ, '.env.example'), 'utf8');
    for (const variavel of ['PORT', 'NODE_ENV', 'SESSION_SECRET', 'TOTP_ENCRYPTION_KEY', 'MFA_TTL_MINUTES', 'DATABASE_PATH', 'TZ', 'SEED_ADMIN_PASSWORD', 'SEED_TECH_PASSWORD']) {
      assert.ok(readme.includes(variavel), `README sem ${variavel}`);
      assert.ok(exemplo.includes(variavel), `.env.example sem ${variavel}`);
    }
  });

  test('o README não expõe a senha do ambiente publicado nem chaves reais', () => {
    assert.ok(!readme.includes(SENHAS.admin));
    assert.ok(!/[0-9a-f]{64}/i.test(readme.replace(/0{64}/g, '')), 'chave hexadecimal de 64 caracteres no README');
  });

  test('o link da versão publicada está preenchido (sem placeholder)', () => {
    assert.ok(!readme.includes('<app>.onrender.com'), 'ainda há o link de exemplo no README');
  });

  test('arquivos de entrega existem: package.json, .env.example, docs e requests.http', () => {
    for (const arquivo of ['package.json', '.env.example', 'docs/auth-flow.md', 'docs/requests.http']) {
      assert.ok(fs.existsSync(path.join(RAIZ, arquivo)), arquivo);
    }
  });

  test('segredos locais não vão para o repositório (.gitignore)', () => {
    const ignorados = fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8');
    for (const item of ['.env', 'node_modules/', 'CREDENCIAIS.md', '*.db']) assert.ok(ignorados.includes(item), item);
  });
});
