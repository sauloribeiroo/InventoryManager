// Configuração da sessão no servidor.
// O navegador guarda apenas um cookie com o ID da sessão; os dados (usuário, estágio
// da autenticação, horário da verificação 2FA) ficam no servidor.

const session = require('express-session');
const env = require('./env');

const sessionMiddleware = session({
  name: 'sid',
  secret: env.sessionSecret, // assina o cookie para impedir que o ID seja forjado
  resave: false,
  saveUninitialized: false, // só cria sessão depois do login
  cookie: {
    httpOnly: true, // JavaScript do navegador não consegue ler o cookie (proteção contra XSS)
    sameSite: 'lax', // cookie não é enviado em requisições de outros sites (proteção contra CSRF)
    secure: env.isProduction, // em produção, só trafega via HTTPS
    maxAge: 8 * 60 * 60 * 1000, // 8 horas; a expiração do 2FA é controlada à parte (MFA_TTL_MINUTES)
  },
});

module.exports = sessionMiddleware;
