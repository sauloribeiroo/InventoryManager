// Rotas de empréstimos: /api/loans/* — exigem sessão autenticada (senha + 2FA) E papel technician.

const { Router } = require('express');
const loanController = require('../controllers/loanController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');
const {
  validateBody,
  isRequiredString,
  isIntegerBetween,
  optional,
} = require('../middlewares/validateMiddleware');

const router = Router();

router.use(requireAuth, requireRole('technician'));

router.get('/', loanController.list);

router.post(
  '/',
  validateBody({
    equipment_id: isIntegerBetween(1, Number.MAX_SAFE_INTEGER),
    borrower_name: isRequiredString,
    destination_department: isRequiredString,
    business_days: isIntegerBetween(1, 30),
    notes: optional((value) => (typeof value === 'string' ? null : 'deve ser texto')),
  }),
  loanController.create
);

router.patch('/:id/return', loanController.returnLoan);

module.exports = router;
