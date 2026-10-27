const { generateSecret, generateURI, verify } = require('otplib');
const QRCode = require('qrcode');

const ISSUER = 'InventoryManager';
const TOLERANCE_SECONDS = 30;

async function createSetup(email) {
  const secret = generateSecret();

  const otpauthUrl = generateURI({ issuer: ISSUER, label: email, secret });

  const qrCode = await QRCode.toDataURL(otpauthUrl);

  return { secret, otpauthUrl, qrCode };
}

async function verifyCode(secret, code, lastTimeStep = null) {
  const result = await verify({
    secret,
    token: code,
    epochTolerance: TOLERANCE_SECONDS,
    afterTimeStep: lastTimeStep ?? undefined,
  });
  return result.valid ? result.timeStep : null;
}

module.exports = { createSetup, verifyCode };
