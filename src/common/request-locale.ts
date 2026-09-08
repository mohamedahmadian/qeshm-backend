import { AsyncLocalStorage } from 'node:async_hooks';

export const APP_LOCALES = ['fa', 'ar', 'ur', 'en', 'hi'] as const;
export type AppLocale = (typeof APP_LOCALES)[number];

/** Persian (Dari included). */
const PERSIAN_COUNTRIES = new Set(['IR', 'AF']);

const URDU_COUNTRIES = new Set(['PK']);

const HINDI_COUNTRIES = new Set(['IN']);

const ARABIC_COUNTRIES = new Set([
  'IQ',
  'SA',
  'AE',
  'KW',
  'BH',
  'QA',
  'OM',
  'YE',
  'SY',
  'JO',
  'LB',
  'PS',
  'EG',
  'LY',
  'TN',
  'DZ',
  'MA',
  'SD',
  'MR',
  'SO',
  'DJ',
  'KM',
  'EH',
]);

/** Default panel language from country. Unknown / unsupported languages → English. */
export function localeFromCountryIso2(iso2?: string | null): AppLocale {
  const code = iso2?.trim().toUpperCase();
  if (!code) return 'en';
  if (PERSIAN_COUNTRIES.has(code)) return 'fa';
  if (ARABIC_COUNTRIES.has(code)) return 'ar';
  if (URDU_COUNTRIES.has(code)) return 'ur';
  if (HINDI_COUNTRIES.has(code)) return 'hi';
  return 'en';
}

const store = new AsyncLocalStorage<AppLocale>();

export function parseAcceptLanguage(
  header?: string | string[],
): AppLocale {
  const raw = Array.isArray(header) ? header[0] : header;
  const code = (raw ?? '')
    .split(',')[0]
    ?.trim()
    .split(';')[0]
    ?.trim()
    .split('-')[0]
    ?.toLowerCase();
  if (code === 'ar' || code === 'ur' || code === 'en' || code === 'hi') {
    return code;
  }
  return 'fa';
}

export function runWithRequestLocale(locale: AppLocale, next: () => void) {
  store.run(locale, next);
}

export function getRequestLocale(): AppLocale {
  return store.getStore() ?? 'fa';
}

export function isLtrLocale(locale: AppLocale) {
  return locale === 'en' || locale === 'hi';
}

export function localizedGeoName(item: {
  nameFa: string;
  nameEn?: string | null;
}) {
  const locale = getRequestLocale();
  if (isLtrLocale(locale)) return item.nameEn || item.nameFa;
  return item.nameFa || item.nameEn || '';
}
