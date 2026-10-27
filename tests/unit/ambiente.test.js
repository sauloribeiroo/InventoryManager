const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { RAIZ } = require('../helpers/ambiente');

const CHAVE_BOA = 'ab'.repeat(32);
const SEGREDO_BOM = 'segredo-de-sessao-com-mais-de-32-caracteres';

function carregarEnv(variaveis) {
  const ambiente = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...variaveis };
  return spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
    cwd: RAIZ,
    env: ambiente,
    encoding: 'utf8',
  });
}

describe('config/env: validação das variáveis de ambiente', () => {
  test('sem SESSION_SECRET o servidor não sobe', () => {
    const r = carregarEnv({ TOTP_ENCRYPTION_KEY: CHAVE_BOA });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /SESSION_SECRET/);
  });

  test('sem TOTP_ENCRYPTION_KEY o servidor não sobe', () => {
    const r = carregarEnv({ SESSION_SECRET: SEGREDO_BOM });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /TOTP_ENCRYPTION_KEY/);
  });

  test('TOTP_ENCRYPTION_KEY precisa ter 64 caracteres hexadecimais', () => {
    const r = carregarEnv({ SESSION_SECRET: SEGREDO_BOM, TOTP_ENCRYPTION_KEY: 'curta' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /64 caracteres/);
  });

  test('em desenvolvimento, os valores de exemplo do .env.example são aceitos', () => {
    const r = carregarEnv({
      SESSION_SECRET: 'troque-por-uma-string-aleatoria-longa',
      TOTP_ENCRYPTION_KEY: '0'.repeat(64),
    });
    assert.equal(r.status, 0, r.stderr);
  });

  test('em produção, SESSION_SECRET curto é recusado', () => {
    const r = carregarEnv({ NODE_ENV: 'production', SESSION_SECRET: 'curto', TOTP_ENCRYPTION_KEY: CHAVE_BOA });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /SESSION_SECRET inseguro/);
  });

  test('em produção, o SESSION_SECRET de exemplo é recusado', () => {
    const r = carregarEnv({
      NODE_ENV: 'production',
      SESSION_SECRET: 'troque-por-uma-string-aleatoria-longa',
      TOTP_ENCRYPTION_KEY: CHAVE_BOA,
    });
    assert.notEqual(r.status, 0);
  });

  test('em produção, a chave de zeros do exemplo é recusada', () => {
    const r = carregarEnv({ NODE_ENV: 'production', SESSION_SECRET: SEGREDO_BOM, TOTP_ENCRYPTION_KEY: '0'.repeat(64) });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /TOTP_ENCRYPTION_KEY inseguro/);
  });

  test('em produção, valores fortes são aceitos', () => {
    const r = carregarEnv({ NODE_ENV: 'production', SESSION_SECRET: SEGREDO_BOM, TOTP_ENCRYPTION_KEY: CHAVE_BOA });
    assert.equal(r.status, 0, r.stderr);
  });
});

describe('seed: senhas vindas do ambiente', () => {
  function rodarSeed(variaveis) {
    return spawnSync(process.execPath, ['src/seed.js'], {
      cwd: RAIZ,
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        SESSION_SECRET: SEGREDO_BOM,
        TOTP_ENCRYPTION_KEY: CHAVE_BOA,
        DATABASE_PATH: path.join(os.tmpdir(), `seed-${Date.now()}-${Math.random()}.db`),
        ...variaveis,
      },
      encoding: 'utf8',
    });
  }

  test('em produção, sem as senhas, o seed aborta', () => {
    const r = rodarSeed({ NODE_ENV: 'production' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /SEED_ADMIN_PASSWORD/);
  });

  test('em produção, com as senhas, o seed conclui', () => {
    const r = rodarSeed({ NODE_ENV: 'production', SEED_ADMIN_PASSWORD: 'Admin#Teste1', SEED_TECH_PASSWORD: 'Tech#Teste1' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Seed concluído: 4 usuários, 5 equipamentos, 3 empréstimos/);
  });

  test('em desenvolvimento, o seed funciona sem variáveis de senha', () => {
    const r = rodarSeed({ NODE_ENV: 'development' });
    assert.equal(r.status, 0, r.stderr);
  });
});
