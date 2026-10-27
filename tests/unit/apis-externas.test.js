const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

const realFetch = globalThis.fetch;

function respostaJson(corpo, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

function modulo(caminho) {
  const resolvido = require.resolve(caminho);
  delete require.cache[resolvido];
  return require(caminho);
}

afterEach(() => {
  globalThis.fetch = realFetch;
  mock.timers.reset();
  mock.restoreAll();
});

describe('httpClient.fetchJson', () => {
  test('devolve o JSON quando a resposta é 2xx', async () => {
    globalThis.fetch = async () => respostaJson({ ok: true });
    const { fetchJson } = modulo('../../src/utils/httpClient');
    assert.deepEqual(await fetchJson('https://exemplo.test'), { ok: true });
  });

  test('lança erro quando a resposta não é 2xx', async () => {
    globalThis.fetch = async () => respostaJson({}, 503);
    const { fetchJson } = modulo('../../src/utils/httpClient');
    await assert.rejects(() => fetchJson('https://exemplo.test'), /HTTP 503/);
  });

  test('passa um sinal de timeout para o fetch', async () => {
    let sinal;
    globalThis.fetch = async (url, opcoes) => {
      sinal = opcoes.signal;
      return respostaJson({});
    };
    const { fetchJson } = modulo('../../src/utils/httpClient');
    await fetchJson('https://exemplo.test', 1234);
    assert.ok(sinal instanceof AbortSignal);
  });

  test('estoura o timeout quando a API demora demais', async () => {
    globalThis.fetch = (url, opcoes) =>
      new Promise((resolve, reject) => {
        opcoes.signal.addEventListener('abort', () => reject(opcoes.signal.reason));
      });
    const { fetchJson } = modulo('../../src/utils/httpClient');
    await assert.rejects(() => fetchJson('https://exemplo.test', 30));
  });
});

describe('exchangeRateService (AwesomeAPI)', () => {
  let chamadas;
  let cenario;

  beforeEach(() => {
    chamadas = 0;
    cenario = { bid: '5.0402', fora: false };
    mock.method(console, 'warn', () => {});
    globalThis.fetch = async (url) => {
      assert.ok(String(url).includes('economia.awesomeapi.com.br/json/last/USD-BRL'));
      chamadas += 1;
      if (cenario.fora) throw new Error('fora do ar');
      return respostaJson({ USDBRL: { bid: cenario.bid, create_date: '2026-10-27 10:00:00' } });
    };
  });

  test('converte a resposta em { source, usd_brl, quoted_at, stale: false }', async () => {
    const { getUsdBrlRate } = modulo('../../src/services/exchangeRateService');
    assert.deepEqual(await getUsdBrlRate(), {
      source: 'AwesomeAPI',
      usd_brl: 5.0402,
      quoted_at: '2026-10-27 10:00:00',
      stale: false,
    });
  });

  test('usa cache: duas leituras seguidas fazem uma única chamada externa', async () => {
    const { getUsdBrlRate } = modulo('../../src/services/exchangeRateService');
    await getUsdBrlRate();
    await getUsdBrlRate();
    assert.equal(chamadas, 1);
  });

  test('sem cache e com a API fora do ar devolve null (sem quebrar)', async () => {
    cenario.fora = true;
    const { getUsdBrlRate } = modulo('../../src/services/exchangeRateService');
    assert.equal(await getUsdBrlRate(), null);
  });

  test('depois de uma falha, não tenta de novo por 30 s', async () => {
    cenario.fora = true;
    const { getUsdBrlRate } = modulo('../../src/services/exchangeRateService');
    await getUsdBrlRate();
    await getUsdBrlRate();
    await getUsdBrlRate();
    assert.equal(chamadas, 1);
  });

  test('passados 30 s da falha, volta a tentar e se recupera', async () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    cenario.fora = true;
    const { getUsdBrlRate } = modulo('../../src/services/exchangeRateService');
    assert.equal(await getUsdBrlRate(), null);

    cenario.fora = false;
    mock.timers.tick(31_000);
    const taxa = await getUsdBrlRate();
    assert.equal(taxa.usd_brl, 5.0402);
    assert.equal(taxa.stale, false);
  });

  test('com cache vencido e API fora do ar, devolve a última cotação marcada como stale', async () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const { getUsdBrlRate } = modulo('../../src/services/exchangeRateService');
    await getUsdBrlRate();

    cenario.fora = true;
    mock.timers.tick(11 * 60 * 1000);
    const taxa = await getUsdBrlRate();
    assert.equal(taxa.usd_brl, 5.0402);
    assert.equal(taxa.stale, true);
  });

  test('cache vencido e API de volta: busca a cotação nova', async () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const { getUsdBrlRate } = modulo('../../src/services/exchangeRateService');
    await getUsdBrlRate();

    cenario.bid = '6.1';
    mock.timers.tick(11 * 60 * 1000);
    assert.equal((await getUsdBrlRate()).usd_brl, 6.1);
  });
});

describe('holidayService (BrasilAPI)', () => {
  let urls;
  let cenario;

  beforeEach(() => {
    urls = [];
    cenario = { fora: false };
    mock.method(console, 'warn', () => {});
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      if (cenario.fora) return respostaJson({}, 500);
      const ano = String(url).split('/').pop();
      return respostaJson([
        { date: `${ano}-11-02`, name: 'Finados', type: 'national' },
        { date: `${ano}-12-25`, name: 'Natal', type: 'national' },
      ]);
    };
  });

  test('consulta um ano e devolve o mapa data → nome', async () => {
    const { getHolidayMap } = modulo('../../src/services/holidayService');
    const { holidays, checked } = await getHolidayMap([2026]);
    assert.equal(checked, true);
    assert.equal(holidays.get('2026-11-02'), 'Finados');
    assert.equal(holidays.get('2026-12-25'), 'Natal');
    assert.ok(urls[0].endsWith('/api/feriados/v1/2026'));
  });

  test('combina vários anos em um único mapa', async () => {
    const { getHolidayMap } = modulo('../../src/services/holidayService');
    const { holidays } = await getHolidayMap([2026, 2027]);
    assert.ok(holidays.has('2026-11-02'));
    assert.ok(holidays.has('2027-11-02'));
  });

  test('guarda cada ano em cache: a segunda consulta não chama a API', async () => {
    const { getHolidayMap } = modulo('../../src/services/holidayService');
    await getHolidayMap([2026]);
    await getHolidayMap([2026]);
    assert.equal(urls.length, 1);
  });

  test('API fora do ar: devolve mapa vazio com checked = false (não quebra)', async () => {
    cenario.fora = true;
    const { getHolidayMap } = modulo('../../src/services/holidayService');
    const resultado = await getHolidayMap([2026]);
    assert.equal(resultado.checked, false);
    assert.equal(resultado.holidays.size, 0);
  });

  test('depois de uma falha, não tenta de novo por 30 s', async () => {
    cenario.fora = true;
    const { getHolidayMap } = modulo('../../src/services/holidayService');
    await getHolidayMap([2026]);
    const chamadasAposPrimeira = urls.length;
    await getHolidayMap([2026]);
    await getHolidayMap([2026]);
    assert.equal(urls.length, chamadasAposPrimeira);
  });

  test('anos que já estão em cache continuam valendo durante a espera após falha', async () => {
    const { getHolidayMap } = modulo('../../src/services/holidayService');
    await getHolidayMap([2026]);
    cenario.fora = true;
    await getHolidayMap([2026, 2027]);
    const resultado = await getHolidayMap([2026]);
    assert.equal(resultado.checked, true);
    assert.ok(resultado.holidays.has('2026-11-02'));
  });
});
