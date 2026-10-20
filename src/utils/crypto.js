// Criptografia simétrica AES-256-GCM para o segredo TOTP guardado no banco.
//
// Por que cifrar? Diferente da senha (que só precisa ser COMPARADA, por isso usa hash),
// o segredo TOTP precisa ser LIDO de volta para calcular o código. Então não dá para usar hash:
// ciframos com uma chave que fica FORA do banco (variável TOTP_ENCRYPTION_KEY).
// Se só o banco vazar, os segredos continuam ilegíveis.
//
// GCM, além de cifrar, gera uma "tag de autenticação": se alguém alterar o texto cifrado
// no banco, a decifragem falha em vez de devolver lixo.
//
// Formato salvo: iv:authTag:ciphertext (cada parte em base64)

const crypto = require('node:crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(env.totpEncryptionKey, 'hex'); // 32 bytes = 256 bits
const IV_LENGTH = 12; // tamanho recomendado de IV para GCM

function encrypt(plainText) {
  const iv = crypto.randomBytes(IV_LENGTH); // IV novo a cada cifragem: o mesmo texto nunca gera o mesmo resultado
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, encrypted].map((part) => part.toString('base64')).join(':');
}

function decrypt(payload) {
  const [iv, authTag, encrypted] = payload.split(':').map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
