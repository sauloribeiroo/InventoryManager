// API externa 1 — AwesomeAPI: cotação do dólar (USD → BRL).
// GET https://economia.awesomeapi.com.br/json/last/USD-BRL
//
// Cache em memória por 10 minutos: evita uma chamada externa a cada listagem do estoque.
// Se a API cair, usamos a última cotação conhecida e marcamos stale: true.

const URL = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';
const CACHE_TTL_MS = 10 * 60 * 1000;
const ESPERA_APOS_FALHA_MS = 30 * 1000; // depois de uma falha, não tenta de novo por 30 s

let cache = null; // { usd_brl, quoted_at, fetchedAt }
let ultimaFalhaEm = null; // quando a AwesomeAPI falhou pela última vez

async function getUsdBrlRate() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return format(cache, false);
  }

  // A API caiu há pouco: devolve o que já temos, sem esperar o timeout de novo
  if (ultimaFalhaEm && Date.now() - ultimaFalhaEm < ESPERA_APOS_FALHA_MS) {
    return cache ? format(cache, true) : null;
  }

  try {
    const data = await fetchJson(URL);
    cache = {
      usd_brl: Number(data.USDBRL.bid), // bid = preço de compra
      quoted_at: data.USDBRL.create_date,
      fetchedAt: Date.now(),
    };
    ultimaFalhaEm = null; // voltou a funcionar
    return format(cache, false);
  } catch (err) {
    ultimaFalhaEm = Date.now();
    console.warn('AwesomeAPI indisponível:', err.message);
    return cache ? format(cache, true) : null; // null = nunca conseguimos uma cotação
  }
}


function format(entry, stale) {
  return { source: 'AwesomeAPI', usd_brl: entry.usd_brl, quoted_at: entry.quoted_at, stale };
}

module.exports = { getUsdBrlRate };
