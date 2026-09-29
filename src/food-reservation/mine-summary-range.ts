import {
  addDaysIso,
  parseIsoDate,
  startOfIranWeekIso,
  todayIsoDateTehran,
} from '../common/iso-date';
import { gregorianToJalali, jalaliPartsToIso } from '../common/jalali-date';
import { isLtrLocale, type AppLocale } from '../common/request-locale';

export const mineSummaryPeriods = ['week', 'month', 'year'] as const;
export type MineSummaryPeriod = (typeof mineSummaryPeriods)[number];
export type MineSummaryGrain = 'day' | 'week' | 'month';

export function mineSummaryGrain(period: MineSummaryPeriod): MineSummaryGrain {
  if (period === 'week') return 'day';
  if (period === 'month') return 'week';
  return 'month';
}

function usesJalali(locale: AppLocale) {
  return !isLtrLocale(locale);
}

function parts(iso: string, jalali: boolean) {
  const [year, month, day] = iso.split('-').map(Number);
  if (!jalali) return { year, month, day };
  return gregorianToJalali(year, month, day);
}

function isoFromParts(year: number, month: number, day: number, jalali: boolean) {
  if (!jalali) {
    return [
      String(year).padStart(4, '0'),
      String(month).padStart(2, '0'),
      String(day).padStart(2, '0'),
    ].join('-');
  }
  const iso = jalaliPartsToIso(year, month, day);
  if (!iso) {
    throw new Error('invalid jalali date');
  }
  return iso;
}

export function startOfLocaleWeekIso(iso: string, locale: AppLocale) {
  if (usesJalali(locale)) return startOfIranWeekIso(iso);
  return addDaysIso(iso, -parseIsoDate(iso).getUTCDay());
}

function monthStart(year: number, month: number, jalali: boolean) {
  return isoFromParts(year, month, 1, jalali);
}

function nextMonthStart(year: number, month: number, jalali: boolean) {
  if (month === 12) return monthStart(year + 1, 1, jalali);
  return monthStart(year, month + 1, jalali);
}

export function defaultMineSummaryRange(
  period: MineSummaryPeriod,
  locale: AppLocale,
  today = todayIsoDateTehran(),
) {
  const jalali = usesJalali(locale);
  if (period === 'week') {
    const from = startOfLocaleWeekIso(today, locale);
    return { from, to: addDaysIso(from, 6) };
  }
  const current = parts(today, jalali);
  if (period === 'month') {
    const from = monthStart(current.year, current.month, jalali);
    const to = addDaysIso(nextMonthStart(current.year, current.month, jalali), -1);
    return { from, to };
  }
  const from = monthStart(current.year, 1, jalali);
  const to = addDaysIso(monthStart(current.year + 1, 1, jalali), -1);
  return { from, to };
}

export function bucketStart(iso: string, grain: MineSummaryGrain, locale: AppLocale) {
  const jalali = usesJalali(locale);
  if (grain === 'day') return iso;
  if (grain === 'week') return startOfLocaleWeekIso(iso, locale);
  const current = parts(iso, jalali);
  return monthStart(current.year, current.month, jalali);
}

export function nextBucket(start: string, grain: MineSummaryGrain, locale: AppLocale) {
  const jalali = usesJalali(locale);
  if (grain === 'day') return addDaysIso(start, 1);
  if (grain === 'week') return addDaysIso(start, 7);
  const current = parts(start, jalali);
  return nextMonthStart(current.year, current.month, jalali);
}

export function eachBucket(
  from: string,
  to: string,
  grain: MineSummaryGrain,
  locale: AppLocale,
) {
  const keys: string[] = [];
  let cursor = bucketStart(from, grain, locale);
  const end = bucketStart(to, grain, locale);
  for (let i = 0; i < 400 && cursor <= end; i += 1) {
    keys.push(cursor);
    const next = nextBucket(cursor, grain, locale);
    if (next <= cursor) break;
    cursor = next;
  }
  return keys;
}
