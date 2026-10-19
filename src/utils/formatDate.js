// Helpers de data. As datas de empréstimo são guardadas como texto AAAA-MM-DD.

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

module.exports = { toISODate, addDays };
