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

/** تبدیل میلادی به جلالی (همان خانوادهٔ الگوریتم jalaali). */
export function gregorianToJalali(gy: number, gm: number, gd: number) {
  const gDays = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.trunc((gy2 + 3) / 4) -
    Math.trunc((gy2 + 99) / 100) +
    Math.trunc((gy2 + 399) / 400) +
    gd +
    gDays[gm - 1];
  let jy = -1595 + 33 * Math.trunc(days / 12053);
  days %= 12053;
  jy += 4 * Math.trunc(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.trunc((days - 1) / 365);
    days = (days - 1) % 365;
  }
  if (days < 186) {
    return { year: jy, month: 1 + Math.trunc(days / 31), day: 1 + (days % 31) };
  }
  const rest = days - 186;
  return { year: jy, month: 7 + Math.trunc(rest / 30), day: 1 + (rest % 30) };
}

function tehranGregorianParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US-u-nu-latn', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const num = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: num('year'), month: num('month'), day: num('day') };
}

/** سال جلالی امروز به وقت تهران. */
export function currentJalaliYear(now = new Date()) {
  const { year, month, day } = tehranGregorianParts(now);
  return gregorianToJalali(year, month, day).year;
}

/**
 * تاریخ تولد با سال جلالی بعد از سال جاری نامعتبر است و نباید ذخیره شود.
 * مقدار نامعتبر `null` برمی‌گردد.
 */
export function sanitizeBirthIso(iso: string | null, now = new Date()): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const birth = gregorianToJalali(Number(match[1]), Number(match[2]), Number(match[3]));
  if (birth.year > currentJalaliYear(now)) return null;
  return iso;
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
