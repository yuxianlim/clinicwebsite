const key = (date: Date) => date.toISOString().slice(0, 10);
export const clinicDateKey = (time: number | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
const observed = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month, day, 12));
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return key(date);
};
const weekday = (year: number, month: number, day: number, occurrence: number) => {
  const date = new Date(Date.UTC(year, month, 1, 12));
  date.setUTCDate(1 + (day - date.getUTCDay() + 7) % 7 + 7 * (occurrence - 1));
  return key(date);
};
const holidays = (year: number) => {
  const memorial = new Date(Date.UTC(year, 5, 0, 12));
  memorial.setUTCDate(memorial.getUTCDate() - (memorial.getUTCDay() + 6) % 7);
  return new Set([observed(year, 0, 1), observed(year + 1, 0, 1), weekday(year, 0, 1, 3), weekday(year, 1, 1, 3), key(memorial), observed(year, 5, 19), observed(year, 6, 4), weekday(year, 8, 1, 1), weekday(year, 9, 1, 2), observed(year, 10, 11), weekday(year, 10, 4, 4), observed(year, 11, 25)]);
};
/** US federal observed holidays, Monday–Friday; start date is not counted. */
export const addClinicBusinessDays = (dateKey: string, count: number) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !Number.isSafeInteger(count) || count < 0 || count > 366) throw new Error('Invalid business-day calculation.');
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || key(date) !== dateKey) throw new Error('Invalid calendar date.');
  for (let remaining = count; remaining > 0;) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (![0, 6].includes(date.getUTCDay()) && !holidays(date.getUTCFullYear()).has(key(date))) remaining--;
  }
  return key(date);
};
