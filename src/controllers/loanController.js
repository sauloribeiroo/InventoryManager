const loanService = require('../services/loanService');

function list(req, res) {
  res.json(loanService.list({ status: req.query.status }));
}

async function create(req, res) {
  const loan = await loanService.create(req.body, req.user.id);
  res.status(201).json(loan);
}

function returnLoan(req, res) {
  res.json(loanService.returnLoan(Number(req.params.id)));
}

module.exports = { list, create, returnLoan };
