// Rotas de autenticação: /auth/*

const { Router } = require('express');
const authController = require('../controllers/authController');
const { validateBody, isEmail, isRequiredString } = require('../middlewares/validateMiddleware');

const router = Router();

router.post('/login', validateBody({ email: isEmail, password: isRequiredString }), authController.login);
router.post('/logout', authController.logout);

module.exports = router;
