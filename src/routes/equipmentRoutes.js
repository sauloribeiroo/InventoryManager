// Rotas do estoque: /api/equipment/* — exigem sessão autenticada (senha + 2FA) E papel technician.

const { Router } = require('express');
const equipmentController = require('../controllers/equipmentController');
const { requireAuth } = require('../middlewares/authMiddleware');
const { requireRole } = require('../middlewares/roleMiddleware');

const router = Router();

router.use(requireAuth, requireRole('technician'));

router.get('/', equipmentController.list);
router.get('/:id', equipmentController.getById);

module.exports = router;
