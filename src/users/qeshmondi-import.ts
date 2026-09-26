import ExcelJS from 'exceljs';
import { toLatinDigits } from '../common/national-id';
import { normalizeNationalId } from '../common/national-id';
import { parseJalaliCompactToIso, parseJalaliSlashToIso } from '../common/jalali-date';
import { UserGender } from '../generated/prisma/client';

export type QeshmondiImportRow = {
  rowNumber: number;
  firstName: string;
  lastName: string;
  fatherName: string | null;
  nationalId: string;
  passportNumber: string | null;
  isResident: boolean;
  gender: UserGender | null;
  occupation: string | null;
  qeshmondiEndDate: string | null;
  birthDate: string | null;
};

export type QeshmondiImportSkip = {
  rowNumber: number;
  reason: string;
};

const HEADER_ALIASES: Record<string, keyof MappedHeaders> = {
  firstname: 'firstName',
  lastname: 'lastName',
  father: 'fatherName',
  mellicode: 'nationalId',
  passportnum: 'passportNumber',
  isresident: 'isResident',
  ismale: 'isMale',
  job: 'occupation',
  date_exp: 'dateExp',
  dateexp: 'dateExp',
  birthdate: 'birthDate',
};

type MappedHeaders = {
  firstName?: number;
  lastName?: number;
  fatherName?: number;
  nationalId?: number;
  passportNumber?: number;
  isResident?: number;
  isMale?: number;
  occupation?: number;
  dateExp?: number;
  birthDate?: number;
};

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text ?? '').join('').trim();
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  return String(value).trim();
}

function normalizeHeader(value: string) {
  return toLatinDigits(value)
    .trim()
    .toLowerCase()
    .replace(/[\s\u200c._-]+/g, '');
}

function parseBooleanCell(raw: string): boolean | null {
  const text = toLatinDigits(raw).trim().toLowerCase();
  if (!text) return null;
  if (['1', 'true', 'yes', 'y', 'بله', 'بلی', 'آری', 'هست', 'مقیم'].includes(text)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'خیر', 'نه', 'نیست', 'غیرمقیم'].includes(text)) {
    return false;
  }
  return null;
}

function parseGender(raw: string): UserGender | null {
  const flag = parseBooleanCell(raw);
  if (flag == null) return null;
  return flag ? UserGender.MALE : UserGender.FEMALE;
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseExpiryToIso(raw: string) {
  const jalali = parseJalaliSlashToIso(raw) || parseJalaliCompactToIso(raw);
  if (jalali) return jalali;
  const iso = toLatinDigits(raw.trim());
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number(iso.slice(0, 4)) > 1600 ? iso : null;
}

function parseBirthToIso(raw: string) {
  return parseJalaliCompactToIso(raw) || parseJalaliSlashToIso(raw);
}

export async function parseQeshmondiExcel(buffer: Buffer): Promise<{
  rows: QeshmondiImportRow[];
  skipped: QeshmondiImportSkip[];
}> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('فایل اکسل برگه‌ای برای خواندن ندارد');
  }

  const headers: MappedHeaders = {};
  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell, col) => {
    const key = HEADER_ALIASES[normalizeHeader(cellText(cell.value))];
    if (key) headers[key] = col;
  });

  if (!headers.firstName || !headers.lastName || !headers.nationalId) {
    throw new Error('ستون‌های FirstName، LastName و MelliCode در فایل یافت نشد');
  }

  const rows: QeshmondiImportRow[] = [];
  const skipped: QeshmondiImportSkip[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const read = (key: keyof MappedHeaders) => {
      const col = headers[key];
      return col ? cellText(row.getCell(col).value) : '';
    };

    const firstName = read('firstName').trim();
    const lastName = read('lastName').trim();
    const nationalId = normalizeNationalId(read('nationalId'));
    if (!firstName && !lastName && !nationalId) return;
    if (!nationalId) {
      skipped.push({ rowNumber, reason: 'کد ملی خالی است' });
      return;
    }
    if (!firstName || !lastName) {
      skipped.push({ rowNumber, reason: 'نام یا نام خانوادگی خالی است' });
      return;
    }

    const dateExpRaw = read('dateExp');
    const birthRaw = read('birthDate');
    const residentRaw = read('isResident');
    const maleRaw = read('isMale');

    rows.push({
      rowNumber,
      firstName,
      lastName,
      fatherName: emptyToNull(read('fatherName')),
      nationalId,
      passportNumber: emptyToNull(read('passportNumber')),
      isResident: parseBooleanCell(residentRaw) ?? false,
      gender: parseGender(maleRaw),
      occupation: emptyToNull(read('occupation')),
      qeshmondiEndDate: dateExpRaw ? parseExpiryToIso(dateExpRaw) : null,
      birthDate: birthRaw ? parseBirthToIso(birthRaw) : null,
    });
  });

  return { rows, skipped };
}
