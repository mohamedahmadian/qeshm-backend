import { ConnectionPool, type Request } from 'mssql';
import { UserGender } from '../generated/prisma/client';
import {
  parseBirthToIso,
  parseExpiryToIso,
  parseGender,
  type QeshmondiImportRow,
  type QeshmondiImportSkip,
} from './qeshmondi-import';
import { normalizeNationalId } from '../common/national-id';

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
    return Number(iso.slice(0, 4)) > 1600 ? iso : null;
  }
  const text = String(value).trim();
  if (!text) return null;
  if (kind === 'expiry') return parseExpiryToIso(text);
  return parseBirthToIso(text) || parseExpiryToIso(text);
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

function textCell(value: unknown) {
  if (value == null) return '';
  return String(value).trim();
}

function mapTblPerson(
  record: Record<string, unknown>,
  rowNumber: number,
  seen: Set<string>,
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
      fatherName: null,
      nationalId,
      passportNumber: null,
      isResident: false,
      gender: sqlGender(record.IsMale),
      occupation: null,
      qeshmondiEndDate: sqlDateToIso(record.date_exp, 'expiry'),
      birthDate: sqlDateToIso(record.BirthDate, 'birth'),
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
        const mapped = mapTblPerson(record, read, seen);
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
          [MelliCode],
          [IsMale],
          [BirthDate],
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
