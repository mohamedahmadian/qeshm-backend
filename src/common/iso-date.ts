export function parseIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function todayIsoDateTehran() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function isoDateTehranDayRange(value: string) {
  const start = new Date(`${value}T00:00:00.000+03:30`);
  return {
    gte: start,
    lt: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}

export function parseOptionalIsoDate(
  value?: string | null,
): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === '') {
    return null;
  }
  return parseIsoDate(value);
}

export function addDaysIso(value: string, days: number) {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function toIsoDateOnly(value?: Date | string | null) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function eachIsoDateInclusive(start: string, end: string) {
  if (start > end) return [];
  const dates: string[] = [];
  let current = start;
  while (current <= end) {
    dates.push(current);
    current = addDaysIso(current, 1);
  }
  return dates;
}
