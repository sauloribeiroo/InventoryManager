// Rotas de autenticação: /auth/*

const { Router } = require('express');
const authController = require('../controllers/authController');
const { requirePendingMfa, requireAuth } = require('../middlewares/authMiddleware');
const { loginLimiter, mfaLimiter } = require('../middlewares/rateLimitMiddleware');
const { validateBody, isEmail, isRequiredString, isTotpCode } = require('../middlewares/validateMiddleware');

const router = Router();

// Etapa 1: senha
router.post('/login', loginLimiter, validateBody({ email: isEmail, password: isRequiredString }), authController.login);

// Etapa 2a: primeiro acesso (configurar o app autenticador)
router.get('/2fa/setup', requirePendingMfa, authController.setupTotp); //gera o QR code
router.post('/2fa/enable', mfaLimiter, requirePendingMfa, validateBody({ code: isTotpCode }), authController.enableTotp);//valida o código de 6 dígitos

// Etapa 2b: acessos seguintes (código atual do app)
router.post('/2fa/verify', mfaLimiter, requirePendingMfa, validateBody({ code: isTotpCode }), authController.verifyTotp); //confere o código nos aacessos seguintes

// Sessão autenticada (senha + código)
router.get('/me', requireAuth, authController.me); //quando autenticação passar
router.post('/logout', authController.logout);

module.exports = router;
