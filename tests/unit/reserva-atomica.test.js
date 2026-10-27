const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { prepararAmbiente, instalarApisFalsas, restaurarFetch } = require('../helpers/ambiente');

let equipmentRepository;
let loanService;
let db;

before(() => {
  prepararAmbiente();
  instalarApisFalsas();
  db = require('../../src/config/database');
  equipmentRepository = require('../../src/repositories/equipmentRepository');
  loanService = require('../../src/services/loanService');
});

after(() => {
  restaurarFetch();
});

describe('equipmentRepository.emprestadoSeDisponivel', () => {
  test('reserva um equipamento disponível e marca como emprestado', () => {
    assert.equal(equipmentRepository.emprestadoSeDisponivel(4), true);
    assert.equal(equipmentRepository.findById(4).status, 'loaned');
  });

  test('a segunda reserva do mesmo equipamento falha (UPDATE atômico)', () => {
    assert.equal(equipmentRepository.emprestadoSeDisponivel(4), false);
  });

  test('equipamento já emprestado ou em manutenção não pode ser reservado', () => {
    assert.equal(equipmentRepository.emprestadoSeDisponivel(1), false);
    assert.equal(equipmentRepository.emprestadoSeDisponivel(5), false);
    assert.equal(equipmentRepository.findById(5).status, 'maintenance');
  });

  test('id inexistente não reserva nada', () => {
    assert.equal(equipmentRepository.emprestadoSeDisponivel(999), false);
  });
});

describe('loanService.create com pedidos que passam juntos pela pré-checagem', () => {
  const dados = { equipment_id: 2, borrower_name: 'Teste', destination_department: 'TI', business_days: 2 };

  test('cinco pedidos iniciados no mesmo instante: só um empréstimo é criado', async () => {
    const resultados = await Promise.allSettled([1, 2, 3, 4, 5].map(() => loanService.create(dados, 2)));
    const criados = resultados.filter((r) => r.status === 'fulfilled');
    const recusados = resultados.filter((r) => r.status === 'rejected');

    assert.equal(criados.length, 1);
    assert.equal(recusados.length, 4);
    for (const r of recusados) {
      assert.equal(r.reason.statusCode, 409);
      assert.equal(r.reason.code, 'CONFLICT');
    }
  });

  test('o banco termina com exatamente 1 empréstimo ativo para o equipamento', () => {
    const { total } = db.prepare("SELECT COUNT(*) AS total FROM loans WHERE equipment_id = 2 AND status = 'active'").get();
    assert.equal(total, 1);
    assert.equal(equipmentRepository.findById(2).status, 'loaned');
  });

  test('a transação desfaz tudo se algo falhar: nada fica pela metade', () => {
    const { runInTransaction } = require('../../src/utils/transaction');
    const antes = db.prepare('SELECT COUNT(*) AS total FROM loans').get().total;
    assert.throws(() =>
      runInTransaction(() => {
        db.prepare("INSERT INTO loans (equipment_id, technician_id, borrower_name, destination_department, checkout_date, expected_return_date, status) VALUES (4, 2, 'x', 'y', '2026-01-01', '2026-01-02', 'active')").run();
        throw new Error('falha no meio');
      })
    );
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM loans').get().total, antes);
  });
});
