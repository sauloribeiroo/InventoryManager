// Helpers de data. As datas de empréstimo são guardadas como texto AAAA-MM-DD.

// Usa a data LOCAL do servidor (não UTC): no Brasil, depois das 21h, o UTC já está no dia seguinte.
// O fuso é definido pela variável TZ (ex.: TZ=America/Sao_Paulo).
function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6; // domingo ou sábado
}

// Soma dias ÚTEIS a partir de uma data, pulando fins de semana e os dias em que isHoliday(date) for true.
// Devolve a data final e a lista de datas puladas por serem feriado.
function addBusinessDays(startDate, businessDays, isHoliday = () => false) {
  let current = new Date(startDate);
  let remaining = businessDays;
  const skippedHolidays = [];

  while (remaining > 0) {
    current = addDays(current, 1);
    if (isWeekend(current)) continue;
    if (isHoliday(current)) {
      skippedHolidays.push(toISODate(current));
      continue;
    }
    remaining -= 1;
  }

  return { date: current, skippedHolidays };
}

module.exports = { toISODate, addDays, addBusinessDays };
