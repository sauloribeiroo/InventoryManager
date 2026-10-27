const { fetchJson } = require('../utils/httpClient');

const cacheByYear = new Map();
const ESPERA_APOS_FALHA_MS = 30 * 1000;
let ultimaFalhaEm = null;

async function getHolidays(year) {
  if (cacheByYear.has(year)) return cacheByYear.get(year);

  const data = await fetchJson(`https://brasilapi.com.br/api/feriados/v1/${year}`);
  const holidays = data.map(({ date, name }) => ({ date, name }));
  cacheByYear.set(year, holidays);
  return holidays;
}

async function getHolidayMap(years) {
  const todosEmCache = years.every((year) => cacheByYear.has(year));
  if (!todosEmCache && ultimaFalhaEm && Date.now() - ultimaFalhaEm < ESPERA_APOS_FALHA_MS) {
    return { holidays: new Map(), checked: false };
  }

  try {
    const lists = await Promise.all(years.map(getHolidays));
    ultimaFalhaEm = null;
    return { holidays: new Map(lists.flat().map((h) => [h.date, h.name])), checked: true };
  } catch (err) {
    ultimaFalhaEm = Date.now();
    console.warn('BrasilAPI indisponível:', err.message);
    return { holidays: new Map(), checked: false };
  }
}

module.exports = { getHolidayMap };
