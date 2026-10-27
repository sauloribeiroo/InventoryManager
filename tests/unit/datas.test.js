const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { toISODate, addDays, addBusinessDays } = require('../../src/utils/formatDate');

describe('toISODate', () => {
  test('formata no padrão AAAA-MM-DD com zeros à esquerda', () => {
    assert.equal(toISODate(new Date(2026, 0, 5)), '2026-01-05');
    assert.equal(toISODate(new Date(2026, 11, 31)), '2026-12-31');
  });

  test('usa a data local, não a UTC (22h30 continua no mesmo dia)', () => {
    assert.equal(toISODate(new Date(2026, 9, 19, 22, 30)), '2026-10-19');
  });
});

describe('addDays', () => {
  test('soma dias atravessando o mês', () => {
    assert.equal(toISODate(addDays(new Date(2026, 9, 30), 3)), '2026-11-02');
  });

  test('aceita dias negativos', () => {
    assert.equal(toISODate(addDays(new Date(2026, 10, 2), -3)), '2026-10-30');
  });

  test('não altera a data original', () => {
    const original = new Date(2026, 9, 1);
    addDays(original, 10);
    assert.equal(toISODate(original), '2026-10-01');
  });
});

describe('addBusinessDays', () => {
  test('pula o fim de semana: sexta + 1 dia útil = segunda', () => {
    const { date } = addBusinessDays(new Date(2026, 9, 23), 1);
    assert.equal(toISODate(date), '2026-10-26');
  });

  test('5 dias úteis a partir de segunda caem na segunda seguinte', () => {
    const { date } = addBusinessDays(new Date(2026, 9, 19), 5);
    assert.equal(toISODate(date), '2026-10-26');
  });

  test('pula feriado em dia útil e informa qual foi pulado', () => {
    const feriados = new Set(['2026-11-02']);
    const { date, skippedHolidays } = addBusinessDays(new Date(2026, 9, 19), 10, (d) => feriados.has(toISODate(d)));
    assert.equal(toISODate(date), '2026-11-03');
    assert.deepEqual(skippedHolidays, ['2026-11-02']);
  });

  test('feriado que cai no fim de semana não é contado como pulado', () => {
    const feriados = new Set(['2026-10-24']);
    const { skippedHolidays } = addBusinessDays(new Date(2026, 9, 23), 1, (d) => feriados.has(toISODate(d)));
    assert.deepEqual(skippedHolidays, []);
  });

  test('zero dias úteis devolve a própria data', () => {
    const { date } = addBusinessDays(new Date(2026, 9, 21), 0);
    assert.equal(toISODate(date), '2026-10-21');
  });

  test('o resultado nunca cai em sábado ou domingo', () => {
    for (let dias = 1; dias <= 30; dias += 1) {
      const { date } = addBusinessDays(new Date(2026, 9, 21), dias);
      assert.ok(![0, 6].includes(date.getDay()), `${dias} dias úteis caiu em dia ${date.getDay()}`);
    }
  });
});
