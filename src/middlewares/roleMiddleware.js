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
