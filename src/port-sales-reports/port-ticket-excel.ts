import ExcelJS from 'exceljs';
import { parseJalaliCompactToIso, parseJalaliSlashToIso } from '../common/jalali-date';
import {
  isValidIranianNationalId,
  normalizeNationalId,
  normalizePassportNumber,
  toLatinDigits,
} from '../common/national-id';

export type PortTicketExcelRow = {
  rowNumber: number;
  ticketNumber: string | null;
  reservationCode: string | null;
  nationalId: string | null;
  passportNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  fatherName: string | null;
  gender: string | null;
  phone: string | null;
  travelDate: string | null;
  travelTime: string | null;
  citizenship: string | null;
  amount: number | null;
  seatNumber: string | null;
  ticketType: string | null;
  vesselName: string | null;
  extras: Record<string, string> | null;
};

type MappedField =
  | 'ticketNumber'
  | 'reservationCode'
  | 'nationalId'
  | 'passportNumber'
  | 'identity'
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'fatherName'
  | 'gender'
  | 'phone'
  | 'travelDate'
  | 'travelTime'
  | 'origin'
  | 'destination'
  | 'citizenship'
  | 'amount'
  | 'seatNumber'
  | 'ticketType'
  | 'vesselName'
  | 'rowIndex';

const HEADER_ALIASES: Record<string, MappedField> = {
  رديف: 'rowIndex',
  ردیف: 'rowIndex',
  row: 'rowIndex',
  rowno: 'rowIndex',
  rownumber: 'rowIndex',
  شماره‌بلیت: 'ticketNumber',
  شمارهبلیت: 'ticketNumber',
  شماره‌بلیط: 'ticketNumber',
  شمارهبلیط: 'ticketNumber',
  شماره‌بليط: 'ticketNumber',
  ticketno: 'ticketNumber',
  ticketnumber: 'ticketNumber',
  tickerno: 'ticketNumber',
  شمارهبليت: 'ticketNumber',
  ثبت: 'ticketNumber',
  شماره‌ثبت: 'ticketNumber',
  شمارهثبت: 'ticketNumber',
  ثبتبلیت: 'ticketNumber',
  ثبتبلیط: 'ticketNumber',
  regno: 'ticketNumber',
  register: 'ticketNumber',
  registration: 'ticketNumber',
  شماره‌رزرو: 'reservationCode',
  شمارهرزرو: 'reservationCode',
  'کد رزرو': 'reservationCode',
  کدرزرو: 'reservationCode',
  pnr: 'reservationCode',
  reservation: 'reservationCode',
  کدملی: 'nationalId',
  کد‌ملی: 'nationalId',
  شماره‌ملی: 'nationalId',
  شمارهملی: 'nationalId',
  nationalid: 'nationalId',
  nationalcode: 'nationalId',
  mellicode: 'nationalId',
  ncode: 'nationalId',
  پاسپورت: 'passportNumber',
  شمارهپاسپورت: 'passportNumber',
  گذرنامه: 'passportNumber',
  شمارهگذرنامه: 'passportNumber',
  passport: 'passportNumber',
  passportno: 'passportNumber',
  passportnumber: 'passportNumber',
  نام: 'firstName',
  نام‌مسافر: 'firstName',
  ناممسافر: 'firstName',
  firstname: 'firstName',
  نام‌خانوادگی: 'lastName',
  نامخانوادگی: 'lastName',
  نام‌خانوادگي: 'lastName',
  lastname: 'lastName',
  family: 'lastName',
  نام‌کامل: 'fullName',
  نامکامل: 'fullName',
  نام‌و‌نام‌خانوادگی: 'fullName',
  نامونامخانوادگی: 'fullName',
  نامونامخانوادگیمسافر: 'fullName',
  نامکاملمسافر: 'fullName',
  fullname: 'fullName',
  passenger: 'fullName',
  نام‌پدر: 'fatherName',
  نامپدر: 'fatherName',
  father: 'fatherName',
  fathername: 'fatherName',
  جنسیت: 'gender',
  جنسيت: 'gender',
  gender: 'gender',
  sex: 'gender',
  شماره‌همراه: 'phone',
  شمارههمراه: 'phone',
  موبایل: 'phone',
  موبايل: 'phone',
  تلفن: 'phone',
  تلفن‌همراه: 'phone',
  phone: 'phone',
  mobile: 'phone',
  تاریخ‌حرکت: 'travelDate',
  تاریخحرکت: 'travelDate',
  تاریخ‌سفر: 'travelDate',
  تاریخسفر: 'travelDate',
  تاريخ‌حركت: 'travelDate',
  تاريخحركت: 'travelDate',
  تاریخ: 'travelDate',
  تاريخ: 'travelDate',
  date: 'travelDate',
  traveldate: 'travelDate',
  departuredate: 'travelDate',
  ساعت‌حرکت: 'travelTime',
  ساعتحرکت: 'travelTime',
  ساعت‌سفر: 'travelTime',
  ساعتسفر: 'travelTime',
  زمان: 'travelTime',
  زمانحرکت: 'travelTime',
  ساعت: 'travelTime',
  time: 'travelTime',
  traveltime: 'travelTime',
  departuretime: 'travelTime',
  // ستون مبدأ/مقصد فایل روی بلیت نمی‌نشیند؛ مسیر از خود گزارش نوشته می‌شود.
  مبدأ: 'origin',
  مبدا: 'origin',
  مبداء: 'origin',
  from: 'origin',
  origin: 'origin',
  source: 'origin',
  مقصد: 'destination',
  to: 'destination',
  destination: 'destination',
  شهروندی: 'citizenship',
  شهروندي: 'citizenship',
  citizenship: 'citizenship',
  نوعبلیت: 'citizenship',
  نوعبلیط: 'citizenship',
  نوعبليط: 'citizenship',
  مبلغ: 'amount',
  مبلغ‌بلیت: 'amount',
  مبلغبلیت: 'amount',
  قیمت: 'amount',
  قيمت: 'amount',
  amount: 'amount',
  price: 'amount',
  fare: 'amount',
  شماره‌صندلی: 'seatNumber',
  شماره‌صندلي: 'seatNumber',
  شمارهصندلی: 'seatNumber',
  seat: 'seatNumber',
  seatno: 'seatNumber',
  seatnumber: 'seatNumber',
  tickettype: 'ticketType',
  classtype: 'ticketType',
  شناور: 'vesselName',
  کشتی: 'vesselName',
  کشتي: 'vesselName',
  نام‌شناور: 'vesselName',
  نامشناور: 'vesselName',
  vessel: 'vesselName',
  ship: 'vesselName',
};

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (value instanceof Date) {
    return value.toISOString();
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

function foldPersian(value: string) {
  return value
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/[\u200c\u200d]/g, '');
}

function normalizeHeader(value: string) {
  return foldPersian(toLatinDigits(value))
    .trim()
    .toLowerCase()
    .replace(/[\s\u200c._\-–—()/\\]+/g, '');
}

function emptyToNull(value: string) {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function parseAmount(raw: string) {
  const digits = toLatinDigits(raw).replace(/[^\d.-]/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(Math.abs(parsed));
}

function excelSerialToIso(serial: number) {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function parseDateToIso(raw: string, cell: ExcelJS.CellValue) {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return `${cell.getUTCFullYear()}-${pad2(cell.getUTCMonth() + 1)}-${pad2(cell.getUTCDate())}`;
  }
  const text = toLatinDigits(raw).trim();
  if (!text) return null;
  const jalali = parseJalaliSlashToIso(text) || parseJalaliCompactToIso(text);
  if (jalali) return jalali;
  if (/^\d{4}-\d{2}-\d{2}/.test(text) && Number(text.slice(0, 4)) > 1600) {
    return text.slice(0, 10);
  }
  const serial = Number(text);
  if (Number.isFinite(serial) && serial >= 1) {
    return excelSerialToIso(serial);
  }
  return null;
}

function timeFromMinutes(totalMinutes: number) {
  const minutes = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

function parseTime(raw: string, cell: ExcelJS.CellValue) {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return `${pad2(cell.getUTCHours())}:${pad2(cell.getUTCMinutes())}`;
  }
  const text = toLatinDigits(raw).trim();
  if (!text) return null;
  const match = text.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  const serial = Number(text);
  if (Number.isFinite(serial) && serial >= 0 && serial < 1) {
    return timeFromMinutes(Math.round(serial * 24 * 60));
  }
  return emptyToNull(text);
}

const IGNORED_HEADERS = new Set([
  'شمارهسفر',
  'tripno',
  'tripnumber',
  'voyageno',
  'voyage',
]);

function splitIdentity(raw: string) {
  const text = raw.trim();
  if (!text) return { nationalId: null as string | null, passportNumber: null as string | null };
  if (isValidIranianNationalId(text)) {
    return { nationalId: normalizeNationalId(text), passportNumber: null };
  }
  const passport = normalizePassportNumber(text);
  return { nationalId: null, passportNumber: passport || null };
}

function resolveHeaderField(label: string): MappedField | 'ignore' | undefined {
  const folded = foldPersian(label).trim();
  const compact = normalizeHeader(folded);
  if (
    IGNORED_HEADERS.has(compact) ||
    compact.includes('شمارهسفر') ||
    compact.includes('وضعیت') ||
    compact === 'status' ||
    compact === 'state' ||
    compact === 'ticketstatus' ||
    compact === 'حالت'
  ) {
    return 'ignore';
  }
  const aliased =
    HEADER_ALIASES[compact] ||
    HEADER_ALIASES[normalizeHeader(folded.replace(/بليط|بلیت|بليت/g, 'بلیط'))];
  if (aliased) return aliased;
  if (
    (compact.includes('کدملی') || compact.includes('شمارهملی') || compact.includes('nationalid')) &&
    (compact.includes('پاسپورت') || compact.includes('گذرنامه') || compact.includes('passport'))
  ) {
    return 'identity';
  }
  if (compact.includes('نام') && compact.includes('خانواد')) return 'fullName';
  return undefined;
}

function findHeaderRow(sheet: ExcelJS.Worksheet) {
  const maxScan = Math.min(20, sheet.rowCount || 0);
  for (let rowNumber = 1; rowNumber <= maxScan; rowNumber += 1) {
    const mapped = new Map<MappedField, number>();
    const extras = new Map<number, string>();
    sheet.getRow(rowNumber).eachCell((cell, col) => {
      const label = cellText(cell.value);
      if (!label) return;
      const field = resolveHeaderField(label);
      if (field === 'ignore') return;
      if (field && !mapped.has(field)) {
        mapped.set(field, col);
      } else if (!field) {
        extras.set(col, label);
      }
    });
    if (
      mapped.has('nationalId') ||
      mapped.has('identity') ||
      mapped.has('passportNumber') ||
      mapped.has('ticketNumber')
    ) {
      return { rowNumber, mapped, extras };
    }
  }
  return null;
}

export async function parsePortTicketExcel(buffer: Buffer): Promise<PortTicketExcelRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('فایل اکسل برگه‌ای برای خواندن ندارد');
  }

  const header = findHeaderRow(sheet);
  if (!header) {
    throw new Error('ستون‌های کد ملی، پاسپورت یا شماره بلیت در فایل یافت نشد');
  }

  const rows: PortTicketExcelRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= header.rowNumber) return;

    const read = (field: MappedField) => {
      const col = header.mapped.get(field);
      if (!col) return { text: '', value: null as ExcelJS.CellValue };
      const cell = row.getCell(col);
      return { text: cellText(cell.value), value: cell.value };
    };

    const nationalRaw = read('nationalId').text;
    const nationalFromColumn = nationalRaw
      ? normalizeNationalId(nationalRaw) || emptyToNull(toLatinDigits(nationalRaw))
      : null;
    const passportFromColumn = emptyToNull(normalizePassportNumber(read('passportNumber').text));
    const identity = splitIdentity(read('identity').text);
    const nationalId = nationalFromColumn || identity.nationalId;
    const passportNumber = passportFromColumn || identity.passportNumber;
    const firstName = emptyToNull(read('firstName').text);
    const lastName = emptyToNull(read('lastName').text);
    const fullName =
      emptyToNull(read('fullName').text) ||
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      null;
    const extras: Record<string, string> = {};
    for (const [col, label] of header.extras) {
      const text = cellText(row.getCell(col).value);
      if (text) extras[label] = text;
    }
    const extraByHeader = (test: (compact: string) => boolean) => {
      for (const [label, text] of Object.entries(extras)) {
        if (test(normalizeHeader(label))) return text;
      }
      return '';
    };
    const ticketNumber =
      emptyToNull(toLatinDigits(read('ticketNumber').text)) ||
      emptyToNull(toLatinDigits(extraByHeader((key) => key.includes('ثبت') || key === 'regno')));
    const travel = read('travelDate');
    const time = read('travelTime');
    const travelDate =
      parseDateToIso(travel.text, travel.value) ||
      parseDateToIso(
        extraByHeader((key) => key === 'تاریخ' || key === 'تاريخ' || key === 'date'),
        null,
      );
    const travelTime =
      parseTime(time.text, time.value) ||
      parseTime(extraByHeader((key) => key === 'زمان' || key === 'ساعت' || key === 'time'), null);

    if (!nationalId && !passportNumber && !ticketNumber && !fullName) {
      return;
    }

    rows.push({
      rowNumber,
      ticketNumber,
      reservationCode: emptyToNull(read('reservationCode').text),
      nationalId,
      passportNumber,
      firstName,
      lastName,
      fullName,
      fatherName: emptyToNull(read('fatherName').text),
      gender: emptyToNull(read('gender').text),
      phone: emptyToNull(toLatinDigits(read('phone').text).replace(/\s+/g, '')),
      travelDate,
      travelTime,
      citizenship: emptyToNull(read('citizenship').text),
      amount: parseAmount(read('amount').text),
      seatNumber: emptyToNull(read('seatNumber').text),
      ticketType: emptyToNull(read('ticketType').text),
      vesselName: emptyToNull(read('vesselName').text),
      extras: Object.keys(extras).length ? extras : null,
    });
  });

  if (!rows.length) {
    throw new Error('هیچ ردیف فروش بلیت در فایل یافت نشد');
  }

  return rows;
}
