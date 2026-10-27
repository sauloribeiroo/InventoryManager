const { Router } = require('express');
const authController = require('../controllers/authController');
const { requirePendingMfa, requireAuth } = require('../middlewares/authMiddleware');
const { loginLimiter, mfaLimiter } = require('../middlewares/rateLimitMiddleware');
const { validateBody, isEmail, isRequiredString, isTotpCode } = require('../middlewares/validateMiddleware');

const router = Router();

router.post('/login', loginLimiter, validateBody({ email: isEmail, password: isRequiredString }), authController.login);

router.get('/2fa/setup', requirePendingMfa, authController.setupTotp);
router.post('/2fa/enable', mfaLimiter, requirePendingMfa, validateBody({ code: isTotpCode }), authController.enableTotp);

router.post('/2fa/verify', mfaLimiter, requirePendingMfa, validateBody({ code: isTotpCode }), authController.verifyTotp);

router.get('/me', requireAuth, authController.me);
router.post('/logout', authController.logout);

module.exports = router;
