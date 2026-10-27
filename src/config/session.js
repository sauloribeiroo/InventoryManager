const session = require('express-session');
const env = require('./env');

const sessionMiddleware = session({
  name: 'sid',
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProduction,
    maxAge: 8 * 60 * 60 * 1000,
  },
});

module.exports = sessionMiddleware;
