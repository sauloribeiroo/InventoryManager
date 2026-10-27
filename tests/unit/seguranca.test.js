const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

process.env.SESSION_SECRET = 'x'.repeat(40);
process.env.TOTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.DATABASE_PATH = path.join(os.tmpdir(), `seg-${Date.now()}.db`);

const { generate } = require('otplib');
const { encrypt, decrypt } = require('../../src/utils/crypto');
const { hashPassword, comparePassword } = require('../../src/utils/password');
const totpService = require('../../src/services/totpService');

describe('criptografia do segredo TOTP (AES-256-GCM)', () => {
  test('cifrar e decifrar devolve o texto original', () => {
    assert.equal(decrypt(encrypt('JBSWY3DPEHPK3PXP')), 'JBSWY3DPEHPK3PXP');
  });

  test('o texto cifrado não contém o segredo', () => {
    assert.ok(!encrypt('JBSWY3DPEHPK3PXP').includes('JBSWY3DPEHPK3PXP'));
  });

  test('cada cifragem usa um IV novo: o mesmo texto gera resultados diferentes', () => {
    assert.notEqual(encrypt('segredo'), encrypt('segredo'));
  });

  test('formato salvo é iv:authTag:ciphertext', () => {
    assert.equal(encrypt('segredo').split(':').length, 3);
  });

  test('adulterar o texto cifrado faz a decifragem falhar (tag de autenticação)', () => {
    const [iv, tag, dados] = encrypt('segredo').split(':');
    const buffer = Buffer.from(dados, 'base64');
    buffer[0] ^= 0xff;
    assert.throws(() => decrypt([iv, tag, buffer.toString('base64')].join(':')));
  });
});

describe('hash de senha (bcrypt)', () => {
  test('o hash não é a senha e tem formato bcrypt com custo 10', async () => {
    const hash = await hashPassword('Senha123');
    assert.notEqual(hash, 'Senha123');
    assert.ok(hash.startsWith('$2') && hash.split('$')[2] === '10');
  });

  test('senha certa confere e senha errada não', async () => {
    const hash = await hashPassword('Senha123');
    assert.equal(await comparePassword('Senha123', hash), true);
    assert.equal(await comparePassword('senha123', hash), false);
  });

  test('a mesma senha gera hashes diferentes (salt aleatório)', async () => {
    assert.notEqual(await hashPassword('Senha123'), await hashPassword('Senha123'));
  });
});

describe('totpService', () => {
  test('createSetup devolve segredo base32, URL otpauth e QR Code em PNG', async () => {
    const { secret, otpauthUrl, qrCode } = await totpService.createSetup('ana@inventory.local');
    assert.match(secret, /^[A-Z2-7]+$/);
    assert.ok(otpauthUrl.startsWith('otpauth://totp/InventoryManager:ana%40inventory.local?'));
    assert.ok(otpauthUrl.includes(`secret=${secret}`));
    assert.ok(otpauthUrl.includes('issuer=InventoryManager'));
    assert.ok(qrCode.startsWith('data:image/png;base64,'));
  });

  test('dois setups geram segredos diferentes', async () => {
    const a = await totpService.createSetup('a@x.com');
    const b = await totpService.createSetup('a@x.com');
    assert.notEqual(a.secret, b.secret);
  });

  test('código correto é aceito e devolve o passo de tempo', async () => {
    const { secret } = await totpService.createSetup('a@x.com');
    const passo = await totpService.verifyCode(secret, await generate({ secret }));
    assert.equal(typeof passo, 'number');
  });

  test('código errado é recusado (null)', async () => {
    const { secret } = await totpService.createSetup('a@x.com');
    const certo = await generate({ secret });
    const errado = certo === '000000' ? '000001' : '000000';
    assert.equal(await totpService.verifyCode(secret, errado), null);
  });

  test('anti-replay: o mesmo código não vale duas vezes', async () => {
    const { secret } = await totpService.createSetup('a@x.com');
    const codigo = await generate({ secret });
    const passo = await totpService.verifyCode(secret, codigo);
    assert.equal(await totpService.verifyCode(secret, codigo, passo), null);
  });

  test('tolerância de relógio: aceita o código do passo seguinte (+30 s)', async () => {
    const { secret } = await totpService.createSetup('a@x.com');
    const proximo = await generate({ secret, epoch: Math.floor(Date.now() / 1000) + 30 });
    assert.notEqual(await totpService.verifyCode(secret, proximo), null);
  });

  test('recusa código de 2 minutos no futuro (fora da tolerância)', async () => {
    const { secret } = await totpService.createSetup('a@x.com');
    const longe = await generate({ secret, epoch: Math.floor(Date.now() / 1000) + 120 });
    assert.equal(await totpService.verifyCode(secret, longe), null);
  });
});
