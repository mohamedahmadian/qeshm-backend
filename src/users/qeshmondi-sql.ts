import { ConnectionPool, type Request } from 'mssql';
import { UserGender } from '../generated/prisma/client';
import {
  parseBirthCandidate,
  parseExpiryToIso,
  parseGender,
  type QeshmondiCitizenProfile,
  type QeshmondiImportRow,
  type QeshmondiImportSkip,
} from './qeshmondi-import';
import { sanitizeBirthIso } from '../common/jalali-date';
import { normalizeNationalId } from '../common/national-id';
import {
  QESHMONDI_LOOKUP_TYPE,
  lookupTitle,
  resolveQeshmondiReligion,
  type QeshmondiLookupHit,
} from './qeshmondi-lookup';

export const QESHMONDI_SQL_CONNECTION_ID = 'qeshmondi';

const READ_BATCH = 2000;

export type QeshmondiSqlSettings = {
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
};

export type QeshmondiSqlBatch = {
  rows: QeshmondiImportRow[];
  skipped: QeshmondiImportSkip[];
  read: number;
  total: number;
};

function createPool(settings: QeshmondiSqlSettings, requestTimeout: number) {
  return new ConnectionPool({
    server: settings.host,
    port: settings.port,
    database: settings.databaseName,
    user: settings.username,
    password: settings.password,
    connectionTimeout: 20_000,
    requestTimeout,
    pool: { max: 2, min: 0, idleTimeoutMillis: 10_000 },
    options: {
      encrypt: settings.encrypt,
      trustServerCertificate: settings.trustServerCertificate,
      enableArithAbort: true,
    },
  });
}

export async function testQeshmondiSqlConnection(settings: QeshmondiSqlSettings) {
  const pool = createPool(settings, 15_000);
  try {
    await pool.connect();
    await pool.request().query('SELECT 1 AS ok');
  } finally {
    await pool.close().catch(() => undefined);
  }
}

function toCount(value: unknown) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value);
  return 0;
}

function localIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sqlDateToIso(value: unknown, kind: 'birth' | 'expiry') {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const iso = localIsoDate(value);
    if (Number(iso.slice(0, 4)) <= 1600) return null;
    return kind === 'birth' ? sanitizeBirthIso(iso) : iso;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (kind === 'expiry') return parseExpiryToIso(text);
  return sanitizeBirthIso(parseBirthCandidate(text) || parseExpiryToIso(text));
}

/** خالی یعنی منبع تاریخی نداده. مقدار پر ولی غیرقابل‌قبول باید null ذخیره شود. */
function sqlBirthDate(value: unknown): { birthDate: string | null; birthDateInvalid: boolean } {
  if (value == null || value === '') return { birthDate: null, birthDateInvalid: false };
  if (typeof value === 'string' && !value.trim()) {
    return { birthDate: null, birthDateInvalid: false };
  }
  const birthDate = sqlDateToIso(value, 'birth');
  if (birthDate) return { birthDate, birthDateInvalid: false };
  return { birthDate: null, birthDateInvalid: true };
}

function sqlGender(value: unknown): UserGender | null {
  if (typeof value === 'boolean') return value ? UserGender.MALE : UserGender.FEMALE;
  if (typeof value === 'number') {
    if (value === 1) return UserGender.MALE;
    if (value === 0) return UserGender.FEMALE;
    return null;
  }
  return parseGender(value == null ? '' : String(value));
}

function sqlBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (value == null || value === '') return null;
  return parseGender(String(value)) == null
    ? null
    : parseGender(String(value)) === UserGender.MALE;
}

function textCell(value: unknown) {
  if (value == null) return '';
  return String(value).trim();
}

function textOrNull(value: unknown) {
  const text = textCell(value);
  return text.length ? text : null;
}

function fingerprintBase64(value: unknown) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : value instanceof Uint8Array
      ? Buffer.from(value)
      : null;
  if (!bytes?.length || bytes.length > 1_500_000) return null;
  return bytes.toString('base64');
}

function citizenFromRecord(
  record: Record<string, unknown>,
  lookups: Map<number, QeshmondiLookupHit>,
): QeshmondiCitizenProfile {
  const religionTitle = lookupTitle(lookups, record.ReligionId, QESHMONDI_LOOKUP_TYPE.religion);
  const religion = resolveQeshmondiReligion(religionTitle);
  return {
    qeshmondiGroup: lookupTitle(lookups, record.GroupId, QESHMONDI_LOOKUP_TYPE.group),
    latinFirstName: textOrNull(record.LatinFirstName),
    latinLastName: textOrNull(record.LatinLastName),
    latinFatherName: textOrNull(record.LatinFather),
    identityNumber: textOrNull(record.IdNum),
    identitySerial: textOrNull(record.IdSerial),
    landlinePhone: textOrNull(record.Phone),
    fax: textOrNull(record.Fax),
    postalCode: textOrNull(record.PostalCode),
    jobAddress: textOrNull(record.JobAdr),
    jobPhone: textOrNull(record.JobPhone),
    jobFax: textOrNull(record.JobFax),
    jobPostalCode: textOrNull(record.JobPostalCode),
    isSingle: sqlBoolean(record.IsSingle),
    nationality: lookupTitle(lookups, record.NationalityId, QESHMONDI_LOOKUP_TYPE.nationality),
    education: lookupTitle(lookups, record.EducationId, QESHMONDI_LOOKUP_TYPE.education),
    protectorOffice: lookupTitle(lookups, record.ProtectorId, QESHMONDI_LOOKUP_TYPE.protector),
    religion: religion.religion,
    religionOther: religion.religionOther,
    nationalIdExpiresAt: sqlDateToIso(record.MelliExpiredDate, 'expiry'),
    passportExpiresAt: sqlDateToIso(record.PassportExpiredDate, 'expiry'),
    bankFullName: textOrNull(record.BankFullName),
    bankFullLatinName: textOrNull(record.BankFullLatinName),
    accountNumber: textOrNull(record.AccountNum),
    cardNumber: textOrNull(record.CardNum),
    cardSeries: textOrNull(record.Serie),
    isBank: sqlBoolean(record.IsBank),
    accountOpeningDate: sqlDateToIso(record.AccountOpeningDate, 'expiry'),
    cardIssuanceDate: sqlDateToIso(record.CardIssuanceDate, 'expiry'),
    cardDeliverDate: sqlDateToIso(record.CardDeliverDate, 'expiry'),
    companyName: textOrNull(record.CompName),
    companySubject: textOrNull(record.CompSubject),
    companyLicenseNumber: textOrNull(record.CompLicNum),
    companyLicenseDate: sqlDateToIso(record.CompLicDate, 'expiry'),
    companyPaperNumber: textOrNull(record.CompPaperNum),
    companyPaperDate: sqlDateToIso(record.CompPaperDate, 'expiry'),
    electricitySubscription: textOrNull(record.EshterkBargh),
    fingerprintBase64: fingerprintBase64(record.FIRData),
  };
}

function mapTblPerson(
  record: Record<string, unknown>,
  rowNumber: number,
  seen: Set<string>,
  lookups: Map<number, QeshmondiLookupHit>,
): { row: QeshmondiImportRow } | { skip: QeshmondiImportSkip } | null {
  const firstName = textCell(record.FirstName);
  const lastName = textCell(record.LastName);
  const nationalId = normalizeNationalId(textCell(record.MelliCode));
  if (!firstName && !lastName && !nationalId) return null;
  if (!nationalId) return { skip: { rowNumber, reason: 'کد ملی خالی است' } };
  if (!firstName || !lastName) {
    return { skip: { rowNumber, reason: 'نام یا نام خانوادگی خالی است' } };
  }
  if (seen.has(nationalId)) {
    return { skip: { rowNumber, reason: 'کد ملی تکراری در جدول مبدأ' } };
  }
  seen.add(nationalId);
  return {
    row: {
      rowNumber,
      firstName,
      lastName,
      fatherName: textOrNull(record.Father),
      nationalId,
      passportNumber: textOrNull(record.PassportNum),
      isResident: sqlBoolean(record.IsResident) ?? false,
      gender: sqlGender(record.IsMale),
      occupation: textOrNull(record.Job),
      qeshmondiEndDate: sqlDateToIso(record.date_exp, 'expiry'),
      ...sqlBirthDate(record.BirthDate),
      citizen: citizenFromRecord(record, lookups),
    },
  };
}

/**
 * One forward read of dbo.tblPerson (CitizenCard). Rows are handed off in
 * batches so 150k records are not held in memory. The request is paused
 * while a batch is written.
 */
export async function streamQeshmondiSqlPeople(
  settings: QeshmondiSqlSettings,
  lookups: Map<number, QeshmondiLookupHit>,
  onBatch: (batch: QeshmondiSqlBatch) => Promise<void>,
) {
  const pool = createPool(settings, 0);
  await pool.connect();
  try {
    const counted = await pool.request().query<{ total: unknown }>(
      'SELECT COUNT_BIG(1) AS total FROM [dbo].[tblPerson]',
    );
    const total = toCount(counted.recordset[0]?.total);
    if (!total) {
      await onBatch({ rows: [], skipped: [], read: 0, total: 0 });
      return;
    }

    const request = pool.request();
    request.stream = true;
    const seen = new Set<string>();
    let rows: QeshmondiImportRow[] = [];
    let skipped: QeshmondiImportSkip[] = [];
    let read = 0;
    let queue = Promise.resolve();
    let failed: unknown = null;
    let writing = false;

    const takeBatch = (): QeshmondiSqlBatch | null => {
      if (!rows.length && !skipped.length) return null;
      const batch: QeshmondiSqlBatch = { rows, skipped, read, total };
      rows = [];
      skipped = [];
      return batch;
    };

    const writeBatch = (batch: QeshmondiSqlBatch | null, resume: boolean) => {
      if (!batch) {
        if (resume && !failed) request.resume();
        return;
      }
      writing = true;
      request.pause();
      queue = queue
        .then(async () => {
          if (failed) return;
          await onBatch(batch);
        })
        .catch((error: unknown) => {
          failed = error;
          request.cancel();
        })
        .finally(() => {
          writing = false;
          if (failed) return;
          if (rows.length + skipped.length >= READ_BATCH) {
            writeBatch(takeBatch(), true);
            return;
          }
          if (resume) request.resume();
        });
    };

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };

      request.on('row', (record: Record<string, unknown>) => {
        if (failed) return;
        read += 1;
        const mapped = mapTblPerson(record, read, seen, lookups);
        if (mapped) {
          if ('skip' in mapped) skipped.push(mapped.skip);
          else rows.push(mapped.row);
        }
        if (!writing && rows.length + skipped.length >= READ_BATCH) {
          writeBatch(takeBatch(), true);
        }
      });
      request.on('error', (error: unknown) => {
        failed = failed ?? error;
        queue.then(() => finish(failed), finish);
      });
      request.on('done', () => {
        writeBatch(takeBatch(), false);
        queue.then(() => finish(failed ?? undefined), finish);
      });
      void (request as Request).query(`
        SELECT
          [FirstName],
          [LastName],
          [LatinFirstName],
          [LatinLastName],
          [Father],
          [LatinFather],
          [NationalityId],
          [IdNum],
          [MelliCode],
          [PassportNum],
          [IsSingle],
          [IsResident],
          [IsMale],
          [BirthDate],
          [MelliExpiredDate],
          [PassportExpiredDate],
          [EducationId],
          [JobAdr],
          [Phone],
          [JobPhone],
          [PostalCode],
          [JobPostalCode],
          [Fax],
          [JobFax],
          [Job],
          [AccountOpeningDate],
          [CardIssuanceDate],
          [BankFullName],
          [BankFullLatinName],
          [GroupId],
          [IdSerial],
          [CardNum],
          [AccountNum],
          [ReligionId],
          [CardDeliverDate],
          [ProtectorId],
          [Serie],
          [IsBank],
          [CompName],
          [CompSubject],
          [CompLicDate],
          [CompLicNum],
          [CompPaperDate],
          [CompPaperNum],
          [EshterkBargh],
          [FIRData],
          [date_exp]
        FROM [dbo].[tblPerson]
      `);
    });
  } finally {
    await pool.close().catch(() => undefined);
  }
}

export function qeshmondiSqlErrorText(error: unknown) {
  const raw = error instanceof Error ? error.message : '';
  const cleaned = raw.replace(/password\s*[=:]\s*\S+/gi, 'password=***').trim();
  return cleaned || 'اتصال به پایگاه برقرار نشد';
}
