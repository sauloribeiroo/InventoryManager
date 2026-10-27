const { Router } = require('express');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const equipmentRoutes = require('./equipmentRoutes');
const loanRoutes = require('./loanRoutes');

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/api/users', userRoutes);
router.use('/api/equipment', equipmentRoutes);
router.use('/api/loans', loanRoutes);

module.exports = router;
