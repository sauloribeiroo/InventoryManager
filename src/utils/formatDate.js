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
  return day === 0 || day === 6;
}

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
