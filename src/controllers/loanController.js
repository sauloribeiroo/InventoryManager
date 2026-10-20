// Empréstimos (somente technician).

const loanService = require('../services/loanService');

// GET /api/loans?status=active
function list(req, res) {
  res.json(loanService.list({ status: req.query.status }));
}

// POST /api/loans — o técnico logado fica registrado como responsável pela saída
function create(req, res) {
  const loan = loanService.create(req.body, req.user.id);
  res.status(201).json(loan);
}

// PATCH /api/loans/:id/return
function returnLoan(req, res) {
  res.json(loanService.returnLoan(Number(req.params.id)));
}

module.exports = { list, create, returnLoan };
