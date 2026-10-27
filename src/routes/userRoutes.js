const { Router } = require('express');
const userController = require('../controllers/userController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const { ROLES } = require('../models/User');
const {
  validateBody,
  isRequiredString,
  isEmail,
  isStrongPassword,
  isBoolean,
  isOneOf,
  optional,
} = require('../middlewares/validateMiddleware');

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/', userController.list);
router.get('/:id', userController.getById);

router.post(
  '/',
  validateBody({ name: isRequiredString, email: isEmail, password: isStrongPassword, role: isOneOf(ROLES) }),
  userController.create
);

router.put(
  '/:id',
  validateBody({
    name: optional(isRequiredString),
    email: optional(isEmail),
    password: optional(isStrongPassword),
    role: optional(isOneOf(ROLES)),
    active: optional(isBoolean),
  }),
  userController.update
);

router.delete('/:id', userController.remove);
router.post('/:id/reset-2fa', userController.resetTotp);

module.exports = router;
