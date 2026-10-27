const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const env = require('./config/env');
const sessionMiddleware = require('./config/session');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');

const app = express();

if (env.isProduction) app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { upgradeInsecureRequests: env.isProduction ? [] : null },
    },
  })
);
app.use(express.json({ limit: '10kb' }));
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
