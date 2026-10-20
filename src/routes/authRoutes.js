// Rotas de autenticação: /auth/*

const { Router } = require('express');
const authController = require('../controllers/authController');
const { requirePendingMfa, requireAuth } = require('../middlewares/authMiddleware');
const { validateBody, isEmail, isRequiredString, isTotpCode } = require('../middlewares/validateMiddleware');

const router = Router();

// Etapa 1: senha
router.post('/login', validateBody({ email: isEmail, password: isRequiredString }), authController.login);

// Etapa 2a: primeiro acesso (configurar o app autenticador)
router.get('/2fa/setup', requirePendingMfa, authController.setupTotp);
router.post('/2fa/enable', requirePendingMfa, validateBody({ code: isTotpCode }), authController.enableTotp);

// Etapa 2b: acessos seguintes (código atual do app)
router.post('/2fa/verify', requirePendingMfa, validateBody({ code: isTotpCode }), authController.verifyTotp);

// Sessão autenticada (senha + código)
router.get('/me', requireAuth, authController.me);
router.post('/logout', authController.logout);

module.exports = router;
