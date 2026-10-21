// Núcleo do segundo fator ("algo que você tem"): TOTP — RFC 6238.
//
// Servidor e app autenticador compartilham um SEGREDO (combinado uma vez, pelo QR Code). Vai ser feita a verificacao se os 2 codigos batem um com o outro.


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

// Confere o código de 6 dígitos com o segredo, existe o antireplay, onde todo codigo so podera ser usado 1 vez
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
