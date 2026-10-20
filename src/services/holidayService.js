// API externa 2 — BrasilAPI: feriados nacionais do ano.
// GET https://brasilapi.com.br/api/feriados/v1/{ano}
//
// Feriados de um ano não mudam, então o resultado fica em cache enquanto o servidor estiver no ar.
// Se a API falhar, o prazo é calculado só pulando fins de semana (holidays_checked: false).

const { fetchJson } = require('../utils/httpClient');

const cacheByYear = new Map(); // ano → [{ date, name }]

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
  try {
    const lists = await Promise.all(years.map(getHolidays));
    return { holidays: new Map(lists.flat().map((h) => [h.date, h.name])), checked: true };
  } catch (err) {
    console.warn('BrasilAPI indisponível:', err.message);
    return { holidays: new Map(), checked: false };
  }
}

module.exports = { getHolidayMap };
