const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  SENHAS,
  prepararAmbiente,
  instalarApisFalsas,
  restaurarFetch,
  iniciarServidor,
  ativarDoisFatores,
  proximoDiaUtil,
  dataISO,
} = require('../helpers/ambiente');

const COTACAO = 5;
const amanha = proximoDiaUtil(new Date(), 1);
const FERIADO_FALSO = dataISO(amanha);

let servidor;
let apis;
let ana;
let bruno;
let admin;

before(async () => {
  prepararAmbiente();
  apis = instalarApisFalsas({
    cotacao: COTACAO,
    feriados: (ano) => (ano === amanha.getFullYear() ? [{ date: FERIADO_FALSO, name: 'Feriado de Teste', type: 'national' }] : []),
  });
  servidor = await iniciarServidor();
  ana = servidor.cliente();
  bruno = servidor.cliente();
  admin = servidor.cliente();
  await ativarDoisFatores(ana, 'ana@inventory.local', SENHAS.tecnico);
  await ativarDoisFatores(bruno, 'bruno@inventory.local', SENHAS.tecnico);
  await ativarDoisFatores(admin, 'admin@inventory.local', SENHAS.admin);
});

after(async () => {
  restaurarFetch();
  await servidor.fechar();
});

function novoEmprestimo(equipmentId, extra = {}) {
  return { equipment_id: equipmentId, borrower_name: 'João Lima', destination_department: 'Financeiro', business_days: 3, ...extra };
}

describe('estoque: permissões e dados', () => {
  test('sem sessão → 401; admin → 403 (menor privilégio)', async () => {
    assert.equal((await servidor.cliente().chamar('GET', '/api/equipment')).status, 401);
    const r = await admin.chamar('GET', '/api/equipment');
    assert.equal(r.status, 403);
    assert.equal(r.corpo.error.code, 'FORBIDDEN');
  });

  test('técnico lista os 5 equipamentos com todos os campos', async () => {
    const r = await ana.chamar('GET', '/api/equipment');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.length, 5);
    for (const campo of ['id', 'asset_tag', 'type', 'brand', 'model', 'serial_number', 'value_usd', 'status', 'location', 'created_at']) {
      assert.ok(campo in r.corpo[0], campo);
    }
  });

  test('integração com a AwesomeAPI: cada item ganha value_brl = value_usd × cotação', async () => {
    const r = await ana.chamar('GET', '/api/equipment');
    for (const item of r.corpo) {
      assert.equal(item.value_brl, Math.round(item.value_usd * COTACAO * 100) / 100);
      assert.equal(item.exchange_rate.source, 'AwesomeAPI');
      assert.equal(item.exchange_rate.usd_brl, COTACAO);
      assert.equal(item.exchange_rate.stale, false);
    }
    assert.ok(apis.chamadas.cotacao.length >= 1);
  });

  test('filtros por status e por tipo', async () => {
    const disponiveis = await ana.chamar('GET', '/api/equipment?status=available');
    assert.deepEqual(disponiveis.corpo.map((e) => e.asset_tag).sort(), ['TI-0002', 'TI-0004']);
    const monitores = await ana.chamar('GET', '/api/equipment?type=monitor');
    assert.equal(monitores.corpo.length, 1);
  });

  test('filtro inválido → 400', async () => {
    assert.equal((await ana.chamar('GET', '/api/equipment?status=quebrado')).status, 400);
    assert.equal((await ana.chamar('GET', '/api/equipment?type=geladeira')).status, 400);
  });

  test('detalhe de um equipamento (com valor em R$) e 404 para id inexistente', async () => {
    const r = await ana.chamar('GET', '/api/equipment/4');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.asset_tag, 'TI-0004');
    assert.equal(r.corpo.value_brl, 549 * COTACAO);
    assert.equal((await ana.chamar('GET', '/api/equipment/999')).status, 404);
  });
});

describe('empréstimos: permissões e listagem', () => {
  test('sem sessão → 401; admin → 403', async () => {
    assert.equal((await servidor.cliente().chamar('GET', '/api/loans')).status, 401);
    assert.equal((await admin.chamar('GET', '/api/loans')).status, 403);
    assert.equal((await admin.chamar('POST', '/api/loans', novoEmprestimo(4))).status, 403);
    assert.equal((await admin.chamar('PATCH', '/api/loans/1/return')).status, 403);
  });

  test('técnico lista os 3 empréstimos do seed, com atraso calculado', async () => {
    const r = await ana.chamar('GET', '/api/loans');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.length, 3);
    const porId = Object.fromEntries(r.corpo.map((l) => [l.id, l]));
    assert.equal(porId[1].is_overdue, false);
    assert.equal(porId[2].is_overdue, true);
    assert.equal(porId[3].is_overdue, false);
    assert.equal(porId[3].status, 'returned');
    assert.ok(porId[1].equipment_asset_tag && porId[1].technician_name && porId[1].equipment_description);
  });

  test('filtro por status e filtro inválido', async () => {
    assert.equal((await ana.chamar('GET', '/api/loans?status=active')).corpo.length, 2);
    assert.equal((await ana.chamar('GET', '/api/loans?status=returned')).corpo.length, 1);
    assert.equal((await ana.chamar('GET', '/api/loans?status=xyz')).status, 400);
  });
});

describe('registrar empréstimo', () => {
  let emprestimo;

  test('cria o empréstimo (201), vinculado ao técnico logado, e o equipamento fica emprestado', async () => {
    const r = await ana.chamar('POST', '/api/loans', novoEmprestimo(4, { notes: '  Auditoria  ' }));
    assert.equal(r.status, 201);
    emprestimo = r.corpo;
    assert.equal(emprestimo.status, 'active');
    assert.equal(emprestimo.technician_id, 2);
    assert.equal(emprestimo.notes, 'Auditoria');
    assert.equal(emprestimo.checkout_date, dataISO(new Date()));

    const equipamento = await ana.chamar('GET', '/api/equipment/4');
    assert.equal(equipamento.corpo.status, 'loaned');
  });

  test('integração com a BrasilAPI: o prazo pula o feriado e informa qual foi', async () => {
    assert.equal(emprestimo.holidays_checked, true);
    assert.deepEqual(emprestimo.skipped_holidays, [{ date: FERIADO_FALSO, name: 'Feriado de Teste' }]);
    assert.ok(apis.chamadas.feriados.length >= 1);

    const esperado = dataISO(proximoDiaUtil(new Date(), 4));
    assert.equal(emprestimo.expected_return_date, esperado);
  });

  test('equipamento já emprestado → 409', async () => {
    const r = await bruno.chamar('POST', '/api/loans', novoEmprestimo(4));
    assert.equal(r.status, 409);
    assert.equal(r.corpo.error.code, 'CONFLICT');
  });

  test('equipamento em manutenção → 409; inexistente → 404', async () => {
    assert.equal((await ana.chamar('POST', '/api/loans', novoEmprestimo(5))).status, 409);
    assert.equal((await ana.chamar('POST', '/api/loans', novoEmprestimo(999))).status, 404);
  });

  test('validação dos campos → 400', async () => {
    const casos = [
      { business_days: 0 },
      { business_days: 31 },
      { business_days: 2.5 },
      { borrower_name: '' },
      { destination_department: undefined },
      { equipment_id: 'abc' },
      { notes: 123 },
    ];
    for (const caso of casos) {
      const r = await ana.chamar('POST', '/api/loans', { ...novoEmprestimo(2), ...caso });
      assert.equal(r.status, 400, JSON.stringify(caso));
      assert.equal(r.corpo.error.code, 'VALIDATION_ERROR');
    }
    assert.equal((await ana.chamar('GET', '/api/equipment/2')).corpo.status, 'available');
  });

  test('pedidos simultâneos pelo mesmo equipamento: só um consegue (201) e os outros recebem 409', async () => {
    const respostas = await Promise.all([
      ana.chamar('POST', '/api/loans', novoEmprestimo(2)),
      bruno.chamar('POST', '/api/loans', novoEmprestimo(2)),
      ana.chamar('POST', '/api/loans', novoEmprestimo(2)),
      bruno.chamar('POST', '/api/loans', novoEmprestimo(2)),
      ana.chamar('POST', '/api/loans', novoEmprestimo(2)),
    ]);
    const status = respostas.map((r) => r.status).sort();
    assert.deepEqual(status, [201, 409, 409, 409, 409]);

    const ativos = (await ana.chamar('GET', '/api/loans?status=active')).corpo.filter((l) => l.equipment_id === 2);
    assert.equal(ativos.length, 1);
  });
});

describe('devolução', () => {
  test('devolve (200): registra a data e o equipamento volta a ficar disponível', async () => {
    const r = await ana.chamar('PATCH', '/api/loans/4/return');
    assert.equal(r.status, 200);
    assert.equal(r.corpo.status, 'returned');
    assert.equal(r.corpo.returned_at, dataISO(new Date()));
    assert.equal((await ana.chamar('GET', '/api/equipment/4')).corpo.status, 'available');
  });

  test('devolver de novo → 409; empréstimo inexistente → 404', async () => {
    assert.equal((await ana.chamar('PATCH', '/api/loans/4/return')).status, 409);
    assert.equal((await ana.chamar('PATCH', '/api/loans/999/return')).status, 404);
  });

  test('qualquer técnico pode registrar a devolução de um empréstimo de outro', async () => {
    assert.equal((await bruno.chamar('PATCH', '/api/loans/1/return')).status, 200);
  });

  test('depois de devolvido, o equipamento pode ser emprestado outra vez', async () => {
    const r = await bruno.chamar('POST', '/api/loans', novoEmprestimo(4));
    assert.equal(r.status, 201);
  });
});
