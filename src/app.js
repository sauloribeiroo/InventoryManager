// Configuração central do Express: a ordem dos middlewares importa.

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const env = require('./config/env');
const sessionMiddleware = require('./config/session');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');

const app = express();

// No Render a API fica atrás de um proxy HTTPS; necessário para o cookie "secure" funcionar
if (env.isProduction) app.set('trust proxy', 1);

// Headers HTTP de segurança. O CSP padrão só permite scripts do próprio site (sem scripts inline).
// "upgrade-insecure-requests" força HTTPS: só faz sentido em produção (local roda em HTTP).
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: env.isProduction ? [] : null },
    },
  })
);
app.use(express.json({ limit: '10kb' })); // lê corpo JSON (com limite de tamanho)
app.use(sessionMiddleware); // cria/recupera req.session a partir do cookie
app.use(express.static(path.join(__dirname, '..', 'public'))); // front-end simples

app.use(routes);

app.use(notFound); // nenhuma rota respondeu → 404
app.use(errorHandler); // qualquer erro → JSON padronizado

module.exports = app;
