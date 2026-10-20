// API externa 1 — AwesomeAPI: cotação do dólar (USD → BRL).
// GET https://economia.awesomeapi.com.br/json/last/USD-BRL
//
// Cache em memória por 10 minutos: evita uma chamada externa a cada listagem do estoque.
// Se a API cair, usamos a última cotação conhecida e marcamos stale: true.

const { fetchJson } = require('../utils/httpClient');

const URL = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';
const CACHE_TTL_MS = 10 * 60 * 1000;

let cache = null; // { usd_brl, quoted_at, fetchedAt }

async function getUsdBrlRate() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return format(cache, false);
  }

  try {
    const data = await fetchJson(URL);
    cache = {
      usd_brl: Number(data.USDBRL.bid), // bid = preço de compra
      quoted_at: data.USDBRL.create_date,
      fetchedAt: Date.now(),
    };
    return format(cache, false);
  } catch (err) {
    console.warn('AwesomeAPI indisponível:', err.message);
    return cache ? format(cache, true) : null; // null = nunca conseguimos uma cotação
  }
}

function format(entry, stale) {
  return { source: 'AwesomeAPI', usd_brl: entry.usd_brl, quoted_at: entry.quoted_at, stale };
}

module.exports = { getUsdBrlRate };
