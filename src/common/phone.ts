import { toLatinDigits } from './national-id';

export function normalizePhone(input: string) {
  return toLatinDigits(input.trim()).replace(/[\s-]/g, '');
}

/** همراه ایرانی به شکل ۱۱رقمی با صفر؛ برای جستجو و ثبت نام عمومی. */
export function normalizeMobile(input: string) {
  let phone = normalizePhone(input).replace(/\D/g, '');
  if (phone.startsWith('0098')) {
    phone = phone.slice(4);
  } else if (phone.startsWith('98') && phone.length >= 12) {
    phone = phone.slice(2);
  }
  if (phone.startsWith('9') && phone.length === 10) {
    phone = `0${phone}`;
  }
  return phone;
}

export function phoneLookupValues(input: string) {
  const normalized = normalizeMobile(input);
  if (!normalized) {
    return [];
  }
  const values = new Set<string>([normalized, normalizePhone(input)]);
  if (normalized.startsWith('0') && normalized.length === 11) {
    values.add(normalized.slice(1));
  }
  return [...values].filter(Boolean);
}
