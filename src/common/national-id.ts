import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function toLatinDigits(input: string) {
  return input
    .replace(/[۰-۹]/g, (digit) => String(FA_DIGITS.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(AR_DIGITS.indexOf(digit)));
}

export function normalizeNationalId(input: string) {
  const digits = toLatinDigits(input.trim()).replace(/\D/g, '');
  if (digits.length === 9) {
    return digits.padStart(10, '0');
  }
  return digits;
}

/** شماره گذرنامه: حروف و رقم لاتین، بدون فاصله. */
export function normalizePassportNumber(input: string) {
  return toLatinDigits(input.trim())
    .replace(/[\s-]/g, '')
    .toUpperCase();
}

/** کد ملی ایرانی یا شماره گذرنامه؛ خالی یعنی پاک کردن فیلد. */
export function normalizeIdentityNumber(input: string) {
  const trimmed = toLatinDigits(input.trim());
  if (!trimmed) {
    return null;
  }
  if (isValidIranianNationalId(trimmed)) {
    return normalizeNationalId(trimmed);
  }
  return normalizePassportNumber(trimmed) || null;
}

export function isValidIranianNationalId(input: string) {
  const id = normalizeNationalId(input);
  if (!/^\d{10}$/.test(id) || /^(\d)\1{9}$/.test(id)) {
    return false;
  }

  const check = Number(id[9]);
  const sum = id
    .slice(0, 9)
    .split('')
    .reduce((total, digit, index) => total + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

@ValidatorConstraint({ name: 'isIranianNationalId', async: false })
class IsIranianNationalIdConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return typeof value === 'string' && isValidIranianNationalId(value);
  }

  defaultMessage() {
    return 'کد ملی معتبر نیست';
  }
}

export function IsIranianNationalId(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIranianNationalId',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsIranianNationalIdConstraint,
    });
  };
}
