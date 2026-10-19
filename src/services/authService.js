// Regras do login. A sessão passa por estágios:
//
//   (sem sessão) ──senha correta──► PASSWORD_OK ──código TOTP correto──► AUTHENTICATED
//
// Em PASSWORD_OK o usuário só pode acessar as rotas do 2FA; nenhuma rota protegida.

const AppError = require('../utils/AppError');
const { comparePassword } = require('../utils/password');
const userRepository = require('../repositories/userRepository');

const STAGES = {
  PASSWORD_OK: 'PASSWORD_OK',
  AUTHENTICATED: 'AUTHENTICATED',
};

// Etapa 1 (primeiro fator): confere e-mail + senha e diz qual é o próximo passo.
async function verifyPassword(email, password) {
  const user = userRepository.findByEmail(email.trim().toLowerCase());

  // Mesma resposta para "e-mail não existe" e "senha errada":
  // o atacante não descobre quais e-mails estão cadastrados.
  const passwordMatches = user && (await comparePassword(password, user.password_hash));
  if (!passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
  }

  if (!user.active) {
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Conta desativada. Procure o administrador.');
  }

  // Conta nova (ou 2FA resetado pelo admin) → configuração do 2FA é obrigatória
  const next = user.totp_enabled ? 'VERIFY_2FA' : 'SETUP_2FA';
  return { user, next };
}

// Grava na sessão que o primeiro fator foi aprovado.
// regenerate() troca o ID da sessão: evita "session fixation" (atacante que plantou um ID antes do login).
function startPendingSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.pendingUserId = userId;
      req.session.stage = STAGES.PASSWORD_OK;
      resolve();
    });
  });
}

// Logout: apaga a sessão no servidor, então o cookie antigo deixa de valer.
function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

module.exports = { STAGES, verifyPassword, startPendingSession, destroySession };
