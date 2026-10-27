const {fetchJson} = require('../utils/httpClient');
const URL = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';
const CACHE_TTL_MS = 10 * 60 * 1000;
const ESPERA_APOS_FALHA_MS = 30 * 1000;

let cache = null;
let ultimaFalhaEm = null;

async function getUsdBrlRate() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return format(cache, false);
  }

  if (ultimaFalhaEm && Date.now() - ultimaFalhaEm < ESPERA_APOS_FALHA_MS) {
    return cache ? format(cache, true) : null;
  }

  try {
    const data = await fetchJson(URL);
    cache = {
      usd_brl: Number(data.USDBRL.bid),
      quoted_at: data.USDBRL.create_date,
      fetchedAt: Date.now(),
    };
    ultimaFalhaEm = null;
    return format(cache, false);
  } catch (err) {
    ultimaFalhaEm = Date.now();
    console.warn('AwesomeAPI indisponível:', err.message);
    return cache ? format(cache, true) : null;
  }
}

function format(entry, stale) {
  return { source: 'AwesomeAPI', usd_brl: entry.usd_brl, quoted_at: entry.quoted_at, stale };
}

module.exports = { getUsdBrlRate };
