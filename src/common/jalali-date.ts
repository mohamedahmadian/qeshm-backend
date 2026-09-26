import { toLatinDigits } from './national-id';

/** تبدیل تاریخ جلالی به میلادی (الگوریتم jalaali). */
export function jalaliToGregorian(jy: number, jm: number, jd: number) {
  let year = jy + 1595;
  let days =
    -355668 +
    365 * year +
    Math.trunc(year / 33) * 8 +
    Math.trunc(((year % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.trunc(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.trunc(--days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.trunc(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.trunc((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const months = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12 && gd > months[gm]; gm += 1) {
    gd -= months[gm];
  }
  return { year: gy, month: gm, day: gd };
}

export function jalaliPartsToIso(year: number, month: number, day: number) {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1200 ||
    year > 1600 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const gregorian = jalaliToGregorian(year, month, day);
  if (
    gregorian.month < 1 ||
    gregorian.month > 12 ||
    gregorian.day < 1 ||
    gregorian.day > 31
  ) {
    return null;
  }
  return [
    String(gregorian.year).padStart(4, '0'),
    String(gregorian.month).padStart(2, '0'),
    String(gregorian.day).padStart(2, '0'),
  ].join('-');
}

/** 1405/06/15 یا 1405-6-15 یا ۱۴۰۵/۶/۱۵ */
export function parseJalaliSlashToIso(value: string) {
  const text = toLatinDigits(value.trim()).replace(/[.\-]/g, '/');
  const match = text.match(/^(\d{3,4})\s*\/\s*(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (!match) return null;
  return jalaliPartsToIso(Number(match[1]), Number(match[2]), Number(match[3]));
}

/** 13640630 → سال ۱۳۶۴، ماه ۶، روز ۳۰ */
export function parseJalaliCompactToIso(value: string) {
  const digits = toLatinDigits(value.trim()).replace(/\D/g, '');
  if (!/^\d{8}$/.test(digits)) return null;
  return jalaliPartsToIso(
    Number(digits.slice(0, 4)),
    Number(digits.slice(4, 6)),
    Number(digits.slice(6, 8)),
  );
}
