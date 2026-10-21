// Núcleo do segundo fator ("algo que você tem"): TOTP — RFC 6238.
//
// Servidor e app autenticador compartilham um SEGREDO (combinado uma vez, pelo QR Code).
// A cada 30 segundos os dois calculam, de forma independente:
//
//   passo  = floor(horario_unix / 30)
//   codigo = HMAC-SHA1(segredo, passo) → truncado em 6 dígitos
//
// Se o código digitado bate com o calculado pelo servidor, o usuário prova que tem o celular.

const { generateSecret, generateURI, verify } = require('otplib');  //importação da biblioteca tplib
const QRCode = require('qrcode');

const ISSUER = 'InventoryManager'; // nome que aparece no app autenticador
const TOLERANCE_SECONDS = 30; // aceita o código do passo anterior/seguinte (relógio do celular adiantado/atrasado) //tolerancia de 30 segundos do código

// Gera um segredo novo (base32, 160 bits) e o QR Code que o app autenticador lê.
async function createSetup(email) {  //criação de um segredo aleatório novo
  const secret = generateSecret();

  // otpauth://totp/InventoryManager:ana@inventory.local?secret=...&issuer=InventoryManager
  const otpauthUrl = generateURI({ issuer: ISSUER, label: email, secret }); //monta o endereço

  const qrCode = await QRCode.toDataURL(otpauthUrl); // imagem PNG em base64, pronta para <img src>

  return { secret, otpauthUrl, qrCode }; //devolve o segredo, endereço e o QR code
}

// Confere o código de 6 dígitos com o segredo.
// Retorna o passo de tempo aceito (para ser salvo como lastTimeStep) ou null se for inválido.
//
// Anti-replay: um código vale ~30 s; sem proteção, quem visse o código na tela (ou interceptasse
// a requisição) poderia reutilizá-lo nesse intervalo. Passando o último passo já aceito,
// códigos daquele passo ou de passos anteriores são recusados → cada código vale UMA vez.
async function verifyCode(secret, code, lastTimeStep = null) {  //pede a biblioteca para verificar o código
  const result = await verify({
    secret,
    token: code,
    epochTolerance: TOLERANCE_SECONDS,
    afterTimeStep: lastTimeStep ?? undefined,
  });
  return result.valid ? result.timeStep : null; //se válido, devolve o passo de tempo
}

module.exports = { createSetup, verifyCode };
