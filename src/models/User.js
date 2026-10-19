// Tabela de usuários: guarda a senha (hash) e os dados do segundo fator (TOTP).

const ROLES = ['admin', 'technician'];

const createTableSql = `
  CREATE TABLE IF NOT EXISTS users (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    email            TEXT    NOT NULL UNIQUE,
    password_hash    TEXT    NOT NULL,                 -- bcrypt, nunca a senha em texto
    role             TEXT    NOT NULL CHECK (role IN ('admin', 'technician')),
    totp_secret_enc  TEXT,                             -- segredo TOTP cifrado (AES-256-GCM); NULL = 2FA não configurado
    totp_enabled     INTEGER NOT NULL DEFAULT 0,       -- 1 depois que o usuário confirma o primeiro código
    last_totp_step   INTEGER,                          -- último passo de 30 s aceito (anti-replay)
    failed_attempts  INTEGER NOT NULL DEFAULT 0,       -- erros seguidos de código 2FA
    locked_until     TEXT,                             -- data/hora ISO até quando a conta está bloqueada
    active           INTEGER NOT NULL DEFAULT 1,       -- conta desativada não consegue logar
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`;

module.exports = { tableName: 'users', ROLES, createTableSql };
