// API externa 2 — BrasilAPI: feriados nacionais do ano.
// GET https://brasilapi.com.br/api/feriados/v1/{ano}
//
// Feriados de um ano não mudam, então o resultado fica em cache enquanto o servidor estiver no ar.
// Se a API falhar, o prazo é calculado só pulando fins de semana (holidays_checked: false).

const { fetchJson } = require('../utils/httpClient');

const cacheByYear = new Map(); // ano → [{ date, name }]
const ESPERA_APOS_FALHA_MS = 30 * 1000; // depois de uma falha, não tenta de novo por 30 s
let ultimaFalhaEm = null; // quando a BrasilAPI falhou pela última vez


async function getHolidays(year) {
  if (cacheByYear.has(year)) return cacheByYear.get(year);

  const data = await fetchJson(`https://brasilapi.com.br/api/feriados/v1/${year}`);
  const holidays = data.map(({ date, name }) => ({ date, name }));
  cacheByYear.set(year, holidays);
  return holidays;
}

// Busca os feriados dos anos informados (um empréstimo pode virar o ano)
// e devolve um Map "AAAA-MM-DD" → nome do feriado.
async function getHolidayMap(years) {
  // BrasilAPI caiu há pouco e falta algum ano no cache: não espera o timeout de novo
  const todosEmCache = years.every((year) => cacheByYear.has(year));
  if (!todosEmCache && ultimaFalhaEm && Date.now() - ultimaFalhaEm < ESPERA_APOS_FALHA_MS) {
    return { holidays: new Map(), checked: false };
  }

  try {
    const lists = await Promise.all(years.map(getHolidays));
    ultimaFalhaEm = null; // voltou a funcionar
    return { holidays: new Map(lists.flat().map((h) => [h.date, h.name])), checked: true };
  } catch (err) {
    ultimaFalhaEm = Date.now();
    console.warn('BrasilAPI indisponível:', err.message);
    return { holidays: new Map(), checked: false };
  }
}


module.exports = { getHolidayMap };
