// Lê as variáveis de ambiente em um único lugar e falha cedo se faltar algo obrigatório.
// O .env é carregado pelo próprio Node (flag --env-file-if-exists nos scripts do package.json).

const required = ['SESSION_SECRET', 'TOTP_ENCRYPTION_KEY'];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name} (veja o .env.example)`);
  }
}

if (!/^[0-9a-fA-F]{64}$/.test(process.env.TOTP_ENCRYPTION_KEY)) {
  throw new Error('TOTP_ENCRYPTION_KEY deve ter 64 caracteres hexadecimais (32 bytes)');
}

// Em produção, os valores de exemplo do .env.example não podem ser usados
if (process.env.NODE_ENV === 'production') {
  if (process.env.SESSION_SECRET.length < 32 || process.env.SESSION_SECRET === 'troque-por-uma-string-aleatoria-longa') {
    throw new Error('SESSION_SECRET inseguro para produção: use uma string aleatória com 32+ caracteres');
  }
  if (/^0+$/.test(process.env.TOTP_ENCRYPTION_KEY)) {
    throw new Error('TOTP_ENCRYPTION_KEY inseguro para produção: não use a chave de exemplo (só zeros)');
  }
}

const env = {
  port: Number(process.env.PORT) || 3000,
  isProduction: process.env.NODE_ENV === 'production',
  sessionSecret: process.env.SESSION_SECRET,
  totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY,
  mfaTtlMinutes: Number(process.env.MFA_TTL_MINUTES) || 30,
  databasePath: process.env.DATABASE_PATH || './data/inventory.db',
};

module.exports = env;
