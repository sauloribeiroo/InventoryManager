// Autorização por papel. Sempre usado DEPOIS do requireAuth (que preenche req.user).
//
//   401 = "não sei quem você é"         (requireAuth)
//   403 = "sei quem você é, mas não pode" (requireRole)
//
// Uso: router.get('/users', requireAuth, requireRole('admin'), controller.list)

const AppError = require('../utils/AppError');

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, 'FORBIDDEN', 'Você não tem permissão para acessar este recurso.'));
    }
    next();
  };
}

module.exports = { requireRole };
