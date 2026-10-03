import { randomUUID } from 'crypto';
import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { buildStyledExcelExport } from '../common/excel-export';
import { gregorianToJalali } from '../common/jalali-date';
import { getRequestLocale } from '../common/request-locale';
import { decodeUploadedFileName } from '../common/upload-filename';
import {
  addDaysIso,
  parseIsoDate,
  startOfIranWeekIso,
  toIsoDateOnly,
  toTehranIsoDateOnly,
} from '../common/iso-date';
import { toLatinDigits } from '../common/national-id';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import {
  normalizeDocumentType,
} from '../files/files.service';
import { PortTicketQeshmondiStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortSalesReportDto } from './dto/create-port-sales-report.dto';
import { ExportPortTicketSalesQueryDto } from './dto/export-port-ticket-sales-query.dto';
import { FindPortSalesReportsQueryDto } from './dto/find-port-sales-reports-query.dto';
import { FindPortTicketQuotaQueryDto } from './dto/find-port-ticket-quota-query.dto';
import { FindPortTicketSalesQueryDto } from './dto/find-port-ticket-sales-query.dto';
import { UpdatePortSalesReportDto } from './dto/update-port-sales-report.dto';
import {
  DEFAULT_PORT_DESTINATION,
  DEFAULT_PORT_ORIGIN,
  MAX_PORT_SALES_EXCEL_BYTES,
} from './port-sales.constants';
import { parsePortTicketExcel, type PortTicketExcelRow } from './port-ticket-excel';

const NATIONAL_ID_PREFIX = '345';
const WEEKLY_TRIP_LIMIT = 1;

const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

type QuotaScope = 'weekly' | 'personal';
type QuotaStatus = 'allowed' | 'violation';

type QuotaRow = {
  weekStart: string | null;
  weekEnd: string | null;
  nationalId: string;
  total: number;
  allowed: number;
  unauthorized: number;
  status: QuotaStatus;
};

const TICKET_INSERT_CHUNK = 400;
const IMPORT_JOB_TTL_MS = 30 * 60 * 1000;

type ImportJobPhase = 'parsing' | 'saving' | 'done' | 'error';

type ImportJob = {
  id: string;
  phase: ImportJobPhase;
  percent: number;
  processed: number;
  total: number;
  reportId?: string;
  error?: string;
  updatedAt: number;
};

function importErrorText(error: unknown) {
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'string' && body.trim()) return body;
    if (body && typeof body === 'object' && 'message' in body) {
      const message = (body as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
      if (Array.isArray(message)) {
        const text = message.filter((item) => typeof item === 'string').join('، ');
        if (text) return text;
      }
    }
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'ثبت گزارش فروش انجام نشد';
}

function normalizePortName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function assertDistinctPorts(origin: string, destination: string) {
  if (normalizePortName(origin) === normalizePortName(destination)) {
    throw new BadRequestException('مبدأ و مقصد نباید یکی باشند');
  }
}

function chunkItems<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function toTicketCreateData(
  reportId: string,
  row: PortTicketExcelRow,
): Prisma.PortTicketSaleCreateManyInput {
  return {
    reportId,
    rowNumber: row.rowNumber,
    ticketNumber: row.ticketNumber,
    reservationCode: row.reservationCode,
    nationalId: row.nationalId,
    passportNumber: row.passportNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: row.fullName,
    fatherName: row.fatherName,
    gender: row.gender,
    phone: row.phone,
    travelDate: row.travelDate ? parseIsoDate(row.travelDate) : null,
    travelTime: row.travelTime,
    origin: row.origin,
    destination: row.destination,
    citizenship: row.citizenship,
    amount: row.amount,
    seatNumber: row.seatNumber,
    ticketType: row.ticketType,
    vesselName: row.vesselName,
    extras: row.extras ?? undefined,
  };
}

type UploadedExcel = {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
};

const fileSelect = {
  id: true,
  originalName: true,
  mimeType: true,
  byteSize: true,
} satisfies Prisma.StoredFileSelect;

const reportSelect = {
  id: true,
  reportDate: true,
  origin: true,
  destination: true,
  fileId: true,
  originalFileName: true,
  recordCount: true,
  uniqueNationalIdCount: true,
  createdAt: true,
  updatedAt: true,
  file: { select: fileSelect },
} satisfies Prisma.PortSalesReportSelect;

const ticketSelect = {
  id: true,
  reportId: true,
  rowNumber: true,
  ticketNumber: true,
  reservationCode: true,
  nationalId: true,
  passportNumber: true,
  firstName: true,
  lastName: true,
  fullName: true,
  fatherName: true,
  gender: true,
  phone: true,
  travelDate: true,
  travelTime: true,
  origin: true,
  destination: true,
  qeshmondiStatus: true,
  citizenship: true,
  amount: true,
  seatNumber: true,
  ticketType: true,
  vesselName: true,
  extras: true,
  createdAt: true,
} satisfies Prisma.PortTicketSaleSelect;

function serializeReport<
  T extends {
    reportDate: Date;
    createdAt: Date;
    updatedAt: Date;
    originalFileName?: string;
    file?: { originalName?: string | null } | null;
  },
>(item: T) {
  return {
    ...item,
    originalFileName:
      typeof item.originalFileName === 'string'
        ? decodeUploadedFileName(item.originalFileName)
        : item.originalFileName,
    file: item.file
      ? {
          ...item.file,
          originalName:
            typeof item.file.originalName === 'string'
              ? decodeUploadedFileName(item.file.originalName)
              : item.file.originalName,
        }
      : item.file,
    reportDate: toIsoDateOnly(item.reportDate),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function serializeTicket<T extends { travelDate: Date | null; createdAt: Date }>(item: T) {
  return {
    ...item,
    travelDate: toIsoDateOnly(item.travelDate),
    createdAt: item.createdAt.toISOString(),
  };
}

function wasQeshmondiOn(
  user:
    | {
        isQeshmondi: boolean;
        qeshmondiStartDate: Date | null;
        qeshmondiEndDate: Date | null;
      }
    | undefined,
  checkIso: string,
) {
  if (!user) return false;
  const start = toTehranIsoDateOnly(user.qeshmondiStartDate);
  const end = toTehranIsoDateOnly(user.qeshmondiEndDate);
  if (start && checkIso < start) return false;
  if (end && checkIso > end) return false;
  return Boolean(start || end || user.isQeshmondi);
}

function weeklyQuotaExcessInFile(
  reportIso: string | null,
  tickets: {
    id: string;
    nationalId: string | null;
    travelDate: Date | null;
    rowNumber?: number | null;
  }[],
) {
  const groups = new Map<string, { id: string; iso: string; rowNumber: number }[]>();
  for (const ticket of tickets) {
    if (!ticket.nationalId) continue;
    const iso = toTehranIsoDateOnly(ticket.travelDate) ?? reportIso;
    if (!iso) continue;
    const week = startOfIranWeekIso(iso);
    const key = `${week}\n${ticket.nationalId}`;
    const placed = { id: ticket.id, iso, rowNumber: ticket.rowNumber ?? 0 };
    const list = groups.get(key);
    if (list) list.push(placed);
    else groups.set(key, [placed]);
  }
  const excessIds: string[] = [];
  for (const list of groups.values()) {
    if (list.length <= WEEKLY_TRIP_LIMIT) continue;
    list.sort(
      (a, b) => a.iso.localeCompare(b.iso) || a.rowNumber - b.rowNumber || a.id.localeCompare(b.id),
    );
    for (const ticket of list.slice(WEEKLY_TRIP_LIMIT)) excessIds.push(ticket.id);
  }
  return { excessIds };
}

function aggregateQuota(
  reportIso: string | null,
  tickets: { nationalId: string | null; travelDate: Date | null }[],
  scope: QuotaScope,
): QuotaRow[] {
  const buckets = new Map<
    string,
    { weekStart: string | null; nationalId: string; total: number }
  >();
  for (const ticket of tickets) {
    if (!ticket.nationalId) continue;
    let weekStart: string | null = null;
    if (scope === 'weekly') {
      const iso = toTehranIsoDateOnly(ticket.travelDate) ?? reportIso;
      if (!iso) continue;
      weekStart = startOfIranWeekIso(iso);
    }
    const key = scope === 'weekly' ? `${weekStart}\n${ticket.nationalId}` : ticket.nationalId;
    const current = buckets.get(key);
    if (current) {
      current.total += 1;
    } else {
      buckets.set(key, { weekStart, nationalId: ticket.nationalId, total: 1 });
    }
  }
  const rows: QuotaRow[] = [];
  for (const bucket of buckets.values()) {
    const allowed = Math.min(bucket.total, WEEKLY_TRIP_LIMIT);
    const unauthorized = bucket.total - allowed;
    rows.push({
      weekStart: bucket.weekStart,
      weekEnd: bucket.weekStart ? addDaysIso(bucket.weekStart, 6) : null,
      nationalId: bucket.nationalId,
      total: bucket.total,
      allowed,
      unauthorized,
      status: unauthorized > 0 ? 'violation' : 'allowed',
    });
  }
  return rows;
}

function filterQuotaRows(rows: QuotaRow[], q?: string) {
  const violations = rows.filter((row) => row.unauthorized > 0);
  const needle = toLatinDigits(q?.trim() ?? '').replace(/\D/g, '');
  if (!needle) return q?.trim() ? [] : violations;
  return violations.filter((row) => row.nationalId.includes(needle));
}

function sortQuotaRows(
  rows: QuotaRow[],
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc' | undefined,
  scope: QuotaScope,
) {
  const active =
    Boolean(sortBy) &&
    (sortDir === 'asc' || sortDir === 'desc') &&
    [
      'week',
      'nationalId',
      'total',
      'allowed',
      'unauthorized',
      'amount',
      'status',
    ].includes(sortBy ?? '');
  const field = active ? sortBy : scope === 'weekly' ? 'week' : 'nationalId';
  const sign = active && sortDir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    let result = 0;
    switch (field) {
      case 'week':
        result = (a.weekStart ?? '').localeCompare(b.weekStart ?? '');
        break;
      case 'nationalId':
        result = a.nationalId.localeCompare(b.nationalId);
        break;
      case 'total':
        result = a.total - b.total;
        break;
      case 'allowed':
        result = a.allowed - b.allowed;
        break;
      case 'unauthorized':
      case 'amount':
        result = a.unauthorized - b.unauthorized;
        break;
      case 'status':
        result = a.status.localeCompare(b.status);
        break;
      default:
        result = 0;
    }
    if (result === 0) {
      result =
        (a.weekStart ?? '').localeCompare(b.weekStart ?? '') ||
        a.nationalId.localeCompare(b.nationalId);
    }
    return result * sign;
  });
}

function jalaliParts(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return gregorianToJalali(year, month, day);
}

function formatWeekLabel(startIso: string, endIso: string) {
  const start = jalaliParts(startIso);
  const end = jalaliParts(endIso);
  const startMonth = JALALI_MONTHS[start.month - 1] ?? '';
  const endMonth = JALALI_MONTHS[end.month - 1] ?? '';
  const text =
    start.year === end.year && start.month === end.month
      ? `${start.day} تا ${end.day} ${endMonth}`
      : start.year === end.year
        ? `${start.day} ${startMonth} تا ${end.day} ${endMonth}`
        : `${start.day} ${startMonth} ${start.year} تا ${end.day} ${endMonth} ${end.year}`;
  return localizeExcelDigits(text);
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function localizeExcelDigits(value: string) {
  const locale = getRequestLocale();
  const alphabet = locale === 'ar' ? AR_DIGITS : locale === 'fa' || locale === 'ur' ? FA_DIGITS : '';
  if (!alphabet) return value;
  return value.replace(/\d/g, (digit) => alphabet[Number(digit)] ?? digit);
}

function formatShamsiDate(iso: string | null) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const jalali = gregorianToJalali(year, month, day);
  return localizeExcelDigits(`${jalali.year}/${jalali.month}/${jalali.day}`);
}

function qeshmondiExpiryCell(nationalId: string | null, endIso: string | null) {
  if (endIso) return formatShamsiDate(endIso);
  if (nationalId?.startsWith(NATIONAL_ID_PREFIX)) {
    return localizeExcelDigits(`شهروند قشم ${NATIONAL_ID_PREFIX}`);
  }
  return '';
}

function invalidQeshmondiReason(
  nationalId: string | null,
  user:
    | {
        isQeshmondi: boolean;
        qeshmondiStartDate: Date | null;
        qeshmondiEndDate: Date | null;
      }
    | undefined,
  checkIso: string,
) {
  if (!nationalId) return 'کد ملی ثبت نشده';
  if (nationalId.startsWith(NATIONAL_ID_PREFIX)) {
    return localizeExcelDigits(`شهروند قشم ${NATIONAL_ID_PREFIX}`);
  }
  if (!user) return 'در سامانه قشموندی ثبت نشده';
  const start = toTehranIsoDateOnly(user.qeshmondiStartDate);
  const end = toTehranIsoDateOnly(user.qeshmondiEndDate);
  if (start && checkIso < start) return 'در تاریخ سفر هنوز قشموند نبوده';
  if (end && checkIso > end) return 'تاریخ انقضای شهروندی گذشته';
  return 'قشموند نیست';
}

@Injectable()
export class PortSalesReportsService {
  private readonly importJobs = new Map<string, ImportJob>();

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindPortSalesReportsQueryDto) {
    const where: Prisma.PortSalesReportWhereInput = {
      OR: query.q
        ? [
            { origin: containsInsensitive(query.q) },
            { destination: containsInsensitive(query.q) },
            { originalFileName: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.PortSalesReportOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        reportDate: (dir) => ({ reportDate: dir }),
        createdAt: (dir) => ({ createdAt: dir }),
        origin: (dir) => ({ origin: dir }),
        destination: (dir) => ({ destination: dir }),
        recordCount: (dir) => ({ recordCount: dir }),
        uniqueNationalIdCount: (dir) => ({ uniqueNationalIdCount: dir }),
        originalFileName: (dir) => ({ originalFileName: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.portSalesReport.findMany({
        where,
        orderBy,
        select: reportSelect,
      });
      return items.map(serializeReport);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.portSalesReport.findMany({
        where,
        orderBy,
        skip,
        take,
        select: reportSelect,
      }),
      this.prisma.portSalesReport.count({ where }),
    ]);
    return paginatedResult(items.map(serializeReport), total, page, pageSize);
  }

  async findOne(id: string) {
    const item = await this.prisma.portSalesReport.findUnique({
      where: { id },
      select: reportSelect,
    });
    if (!item) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    const [prefixIds, validQeshmondiCount, invalidQeshmondiCount, countedTickets] =
      await Promise.all([
        this.prisma.portTicketSale.findMany({
          where: {
            reportId: id,
            nationalId: { startsWith: NATIONAL_ID_PREFIX },
          },
          distinct: ['nationalId'],
          select: { nationalId: true },
        }),
        this.prisma.portTicketSale.count({
          where: {
            reportId: id,
            qeshmondiStatus: PortTicketQeshmondiStatus.VALID,
          },
        }),
        this.prisma.portTicketSale.count({
          where: {
            reportId: id,
            qeshmondiStatus: PortTicketQeshmondiStatus.INVALID,
          },
        }),
        this.prisma.portTicketSale.findMany({
          where: { reportId: id, nationalId: { not: null } },
          select: { nationalId: true, travelDate: true },
        }),
      ]);
    const weeklyQuotaExcessCount = aggregateQuota(
      toTehranIsoDateOnly(item.reportDate),
      countedTickets,
      'weekly',
    ).reduce((sum, row) => sum + row.unauthorized, 0);
    return {
      ...serializeReport(item),
      nationalIdPrefix: NATIONAL_ID_PREFIX,
      nationalIdPrefixCount: prefixIds.length,
      validQeshmondiCount,
      invalidQeshmondiCount,
      weeklyQuotaExcessCount,
    };
  }

  async findTickets(reportId: string, query: FindPortTicketSalesQueryDto) {
    await this.assertExists(reportId);
    const where: Prisma.PortTicketSaleWhereInput = {
      reportId,
      qeshmondiStatus: query.qeshmondiStatus,
      weeklyQuotaExcess: query.weeklyQuota === 'excess' ? true : undefined,
      OR: query.q
        ? [
            { nationalId: containsInsensitive(toLatinDigits(query.q)) },
            { passportNumber: containsInsensitive(query.q) },
            { fullName: containsInsensitive(query.q) },
            { firstName: containsInsensitive(query.q) },
            { lastName: containsInsensitive(query.q) },
            { ticketNumber: containsInsensitive(query.q) },
            { phone: containsInsensitive(toLatinDigits(query.q)) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.PortTicketSaleOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        ticketNumber: (dir) => ({ ticketNumber: dir }),
        nationalId: (dir) => ({ nationalId: dir }),
        passportNumber: (dir) => ({ passportNumber: dir }),
        fullName: (dir) => ({ fullName: dir }),
        citizenship: (dir) => ({ citizenship: dir }),
        qeshmondiStatus: (dir) => ({ qeshmondiStatus: dir }),
        travelDate: (dir) => ({ travelDate: dir }),
        amount: (dir) => ({ amount: dir }),
        rowNumber: (dir) => ({ rowNumber: dir }),
      },
      [{ rowNumber: 'asc' }, { id: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.portTicketSale.findMany({
        where,
        orderBy,
        skip,
        take,
        select: ticketSelect,
      }),
      this.prisma.portTicketSale.count({ where }),
    ]);
    const nationalIds = [
      ...new Set(
        items
          .map((item) => item.nationalId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const expiryByNationalId = new Map<string, string | null>();
    if (nationalIds.length) {
      const users = await this.prisma.user.findMany({
        where: { nationalId: { in: nationalIds } },
        select: { nationalId: true, qeshmondiEndDate: true },
      });
      for (const user of users) {
        if (user.nationalId) {
          expiryByNationalId.set(user.nationalId, toTehranIsoDateOnly(user.qeshmondiEndDate));
        }
      }
    }
    return paginatedResult(
      items.map((item) => ({
        ...serializeTicket(item),
        qeshmondiEndDate: item.nationalId
          ? (expiryByNationalId.get(item.nationalId) ?? null)
          : null,
      })),
      total,
      page,
      pageSize,
    );
  }

  async findQuota(reportId: string, query: FindPortTicketQuotaQueryDto) {
    const rows = filterQuotaRows(await this.loadQuotaRows(reportId, query.scope), query.q);
    const sorted = sortQuotaRows(rows, query.sortBy, query.sortDir, query.scope);
    const { page, pageSize, skip, take } = paginationArgs(query);
    const unauthorizedTotal = sorted.reduce((sum, row) => sum + row.unauthorized, 0);
    return {
      ...paginatedResult(sorted.slice(skip, skip + take), sorted.length, page, pageSize),
      unauthorizedTotal,
    };
  }

  async exportTickets(reportId: string, query: ExportPortTicketSalesQueryDto) {
    if (query.group === 'weekly' || query.group === 'personal') {
      return this.exportQuotaSummary(reportId, query.group, query.subsidy ?? 0, query.q);
    }
    if (query.group === 'all') {
      return this.exportAllTickets(reportId, query);
    }
    const report = await this.prisma.portSalesReport.findUnique({
      where: { id: reportId },
      select: { reportDate: true },
    });
    if (!report) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    const reportIso = toTehranIsoDateOnly(report.reportDate) ?? '';
    const items = await this.prisma.portTicketSale.findMany({
      where: {
        reportId,
        qeshmondiStatus: PortTicketQeshmondiStatus.INVALID,
        OR: query.q
          ? [
              { nationalId: containsInsensitive(toLatinDigits(query.q)) },
              { passportNumber: containsInsensitive(query.q) },
              { fullName: containsInsensitive(query.q) },
              { firstName: containsInsensitive(query.q) },
              { lastName: containsInsensitive(query.q) },
              { ticketNumber: containsInsensitive(query.q) },
              { phone: containsInsensitive(toLatinDigits(query.q)) },
            ]
          : undefined,
      },
      orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }],
      select: ticketSelect,
    });
    const nationalIds = [
      ...new Set(
        items
          .map((item) => item.nationalId)
          .filter(
            (value): value is string =>
              Boolean(value) && !value.startsWith(NATIONAL_ID_PREFIX),
          ),
      ),
    ];
    const users = new Map<
      string,
      {
        isQeshmondi: boolean;
        qeshmondiStartDate: Date | null;
        qeshmondiEndDate: Date | null;
      }
    >();
    for (const chunk of chunkItems(nationalIds, 500)) {
      const found = await this.prisma.user.findMany({
        where: { nationalId: { in: chunk } },
        select: {
          nationalId: true,
          isQeshmondi: true,
          qeshmondiStartDate: true,
          qeshmondiEndDate: true,
        },
      });
      for (const user of found) {
        if (user.nationalId) users.set(user.nationalId, user);
      }
    }
    const sheetName = 'قشموندی نامعتبر';
    return buildStyledExcelExport({
      sheetName,
      fileName: `${sheetName}.xlsx`,
      columns: [
        { header: 'شماره بلیت', key: 'ticketNumber', width: 16 },
        { header: 'کد ملی', key: 'nationalId', width: 16 },
        { header: 'پاسپورت', key: 'passportNumber', width: 16 },
        { header: 'نام مسافر', key: 'fullName', width: 28 },
        { header: 'شهروندی', key: 'citizenship', width: 16 },
        { header: 'تاریخ حرکت', key: 'travelDate', width: 16 },
        { header: 'تاریخ انقضای شهروندی', key: 'qeshmondiEndDate', width: 22 },
        { header: 'علت نامعتبر بودن', key: 'invalidReason', width: 32 },
        { header: 'مبلغ', key: 'amount', width: 14 },
      ],
      rows: items.map((item) => {
        const user = item.nationalId ? users.get(item.nationalId) : undefined;
        const travelIso = toTehranIsoDateOnly(item.travelDate);
        const checkIso = travelIso ?? reportIso;
        const endIso = user ? toTehranIsoDateOnly(user.qeshmondiEndDate) : null;
        return {
          ticketNumber: item.ticketNumber ?? '',
          nationalId: item.nationalId ?? '',
          passportNumber: item.passportNumber ?? '',
          fullName: item.fullName ?? '',
          citizenship: item.citizenship ?? '',
          travelDate: formatShamsiDate(travelIso),
          qeshmondiEndDate: qeshmondiExpiryCell(item.nationalId, endIso),
          invalidReason: invalidQeshmondiReason(item.nationalId, user, checkIso),
          amount: item.amount ?? '',
        };
      }),
    });
  }

  async beginCreate(dto: CreatePortSalesReportDto, file?: UploadedExcel) {
    assertDistinctPorts(
      dto.origin?.trim() || DEFAULT_PORT_ORIGIN,
      dto.destination?.trim() || DEFAULT_PORT_DESTINATION,
    );
    const stored = this.assertExcel(file);
    const mimeType =
      normalizeDocumentType(stored.mimetype, stored.originalname) ??
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const originalFileName = decodeUploadedFileName(stored.originalname, 'port-sales.xlsx');
    const savedFile = await this.prisma.storedFile.create({
      data: {
        mimeType,
        data: Buffer.from(stored.buffer),
        byteSize: stored.size,
        originalName: originalFileName,
      },
      select: { id: true },
    });

    const jobId = randomUUID();
    this.putJob({
      id: jobId,
      phase: 'parsing',
      percent: 5,
      processed: 0,
      total: 0,
      updatedAt: Date.now(),
    });
    setImmediate(() => {
      void this.runImport(jobId, dto, stored.buffer, savedFile.id, originalFileName);
    });
    return { jobId };
  }

  importStatus(jobId: string) {
    this.pruneJobs();
    const job = this.importJobs.get(jobId);
    if (!job) {
      throw new NotFoundException('وضعیت بارگذاری یافت نشد');
    }
    return {
      phase: job.phase,
      percent: job.percent,
      processed: job.processed,
      total: job.total,
      reportId: job.reportId ?? null,
      error: job.error ?? null,
    };
  }

  private async runImport(
    jobId: string,
    dto: CreatePortSalesReportDto,
    buffer: Buffer,
    fileId: string,
    originalFileName: string,
  ) {
    try {
      let rows: PortTicketExcelRow[];
      try {
        rows = await parsePortTicketExcel(buffer);
      } catch (error) {
        throw new BadRequestException(
          error instanceof Error ? error.message : 'خواندن فایل اکسل ممکن نشد',
        );
      }

      const uniqueNationalIds = new Set(
        rows.map((row) => row.nationalId).filter((value): value is string => Boolean(value)),
      );
      this.patchJob(jobId, {
        phase: 'saving',
        percent: rows.length ? 20 : 100,
        processed: 0,
        total: rows.length,
      });

      const timeout = Math.min(
        15 * 60 * 1000,
        Math.max(60_000, Math.ceil(rows.length / TICKET_INSERT_CHUNK) * 20_000),
      );
      let processed = 0;
      const created = await this.prisma.$transaction(
        async (tx) => {
          const report = await tx.portSalesReport.create({
            data: {
              reportDate: parseIsoDate(dto.reportDate),
              origin: dto.origin?.trim() || DEFAULT_PORT_ORIGIN,
              destination: dto.destination?.trim() || DEFAULT_PORT_DESTINATION,
              fileId,
              originalFileName,
              recordCount: rows.length,
              uniqueNationalIdCount: uniqueNationalIds.size,
            },
            select: { id: true },
          });
          for (const chunk of chunkItems(rows, TICKET_INSERT_CHUNK)) {
            await tx.portTicketSale.createMany({
              data: chunk.map((row) => toTicketCreateData(report.id, row)),
            });
            processed += chunk.length;
            const ratio = rows.length ? processed / rows.length : 1;
            this.patchJob(jobId, {
              phase: 'saving',
              percent: Math.min(99, 20 + Math.round(ratio * 79)),
              processed,
              total: rows.length,
            });
          }
          return report.id;
        },
        { maxWait: 20_000, timeout },
      );

      this.patchJob(jobId, {
        phase: 'done',
        percent: 100,
        processed: rows.length,
        total: rows.length,
        reportId: created,
      });
    } catch (error) {
      await this.prisma.storedFile.delete({ where: { id: fileId } }).catch(() => undefined);
      this.patchJob(jobId, {
        phase: 'error',
        error: importErrorText(error),
      });
    }
  }

  private putJob(job: ImportJob) {
    this.pruneJobs();
    this.importJobs.set(job.id, job);
  }

  private patchJob(id: string, patch: Partial<ImportJob>) {
    const current = this.importJobs.get(id);
    if (!current || current.phase === 'done' || current.phase === 'error') return;
    this.importJobs.set(id, { ...current, ...patch, updatedAt: Date.now() });
  }

  private pruneJobs() {
    const cutoff = Date.now() - IMPORT_JOB_TTL_MS;
    for (const [id, job] of this.importJobs) {
      if (job.updatedAt < cutoff) this.importJobs.delete(id);
    }
  }

  async verifyQeshmondi(id: string) {
    const report = await this.prisma.portSalesReport.findUnique({
      where: { id },
      select: { id: true, reportDate: true },
    });
    if (!report) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    const reportIso = toTehranIsoDateOnly(report.reportDate);
    if (!reportIso) {
      throw new BadRequestException('تاریخ گزارش فروش معتبر نیست');
    }

    const tickets = await this.prisma.portTicketSale.findMany({
      where: { reportId: id },
      select: { id: true, nationalId: true, travelDate: true, rowNumber: true },
    });
    const nationalIds = [
      ...new Set(
        tickets
          .map((ticket) => ticket.nationalId)
          .filter(
            (value): value is string =>
              Boolean(value) && !value.startsWith(NATIONAL_ID_PREFIX),
          ),
      ),
    ];
    const users = new Map<
      string,
      {
        isQeshmondi: boolean;
        qeshmondiStartDate: Date | null;
        qeshmondiEndDate: Date | null;
      }
    >();
    for (const chunk of chunkItems(nationalIds, 500)) {
      const found = await this.prisma.user.findMany({
        where: { nationalId: { in: chunk } },
        select: {
          nationalId: true,
          isQeshmondi: true,
          qeshmondiStartDate: true,
          qeshmondiEndDate: true,
        },
      });
      for (const user of found) {
        if (user.nationalId) users.set(user.nationalId, user);
      }
    }

    const validIds: string[] = [];
    const invalidIds: string[] = [];
    for (const ticket of tickets) {
      if (ticket.nationalId?.startsWith(NATIONAL_ID_PREFIX)) {
        validIds.push(ticket.id);
        continue;
      }
      const user = ticket.nationalId ? users.get(ticket.nationalId) : undefined;
      const checkIso = toTehranIsoDateOnly(ticket.travelDate) ?? reportIso;
      if (wasQeshmondiOn(user, checkIso)) {
        validIds.push(ticket.id);
      } else {
        invalidIds.push(ticket.id);
      }
    }

    for (const chunk of chunkItems(validIds, TICKET_INSERT_CHUNK)) {
      await this.prisma.portTicketSale.updateMany({
        where: { id: { in: chunk } },
        data: { qeshmondiStatus: PortTicketQeshmondiStatus.VALID },
      });
    }
    for (const chunk of chunkItems(invalidIds, TICKET_INSERT_CHUNK)) {
      await this.prisma.portTicketSale.updateMany({
        where: { id: { in: chunk } },
        data: { qeshmondiStatus: PortTicketQeshmondiStatus.INVALID },
      });
    }

    const quota = weeklyQuotaExcessInFile(reportIso, tickets);
    await this.prisma.portTicketSale.updateMany({
      where: { reportId: id },
      data: { weeklyQuotaExcess: false },
    });
    for (const chunk of chunkItems(quota.excessIds, TICKET_INSERT_CHUNK)) {
      await this.prisma.portTicketSale.updateMany({
        where: { id: { in: chunk } },
        data: { weeklyQuotaExcess: true },
      });
    }

    return this.findOne(id);
  }

  async update(id: string, dto: UpdatePortSalesReportDto) {
    const current = await this.prisma.portSalesReport.findUnique({
      where: { id },
      select: { origin: true, destination: true },
    });
    if (!current) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    assertDistinctPorts(dto.origin ?? current.origin, dto.destination ?? current.destination);
    const updated = await this.prisma.portSalesReport.update({
      where: { id },
      data: {
        reportDate: dto.reportDate ? parseIsoDate(dto.reportDate) : undefined,
        origin: dto.origin,
        destination: dto.destination,
      },
      select: reportSelect,
    });
    return serializeReport(updated);
  }

  async remove(id: string) {
    const item = await this.prisma.portSalesReport.findUnique({
      where: { id },
      select: { id: true, fileId: true },
    });
    if (!item) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.portSalesReport.delete({ where: { id: item.id } });
      await tx.storedFile.delete({ where: { id: item.fileId } }).catch(() => undefined);
    });
    return { ok: true };
  }

  async filePayload(id: string) {
    const item = await this.prisma.portSalesReport.findUnique({
      where: { id },
      select: {
        originalFileName: true,
        file: { select: { data: true, mimeType: true, originalName: true } },
      },
    });
    if (!item?.file) {
      throw new NotFoundException('فایل گزارش یافت نشد');
    }
    return {
      data: Buffer.from(item.file.data),
      mimeType: item.file.mimeType,
      originalName: decodeUploadedFileName(
        item.file.originalName || item.originalFileName,
        'port-sales.xlsx',
      ),
    };
  }

  private async loadQuotaRows(reportId: string, scope: QuotaScope) {
    const report = await this.prisma.portSalesReport.findUnique({
      where: { id: reportId },
      select: { reportDate: true },
    });
    if (!report) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    const tickets = await this.prisma.portTicketSale.findMany({
      where: { reportId, nationalId: { not: null } },
      select: { nationalId: true, travelDate: true },
    });
    return aggregateQuota(toTehranIsoDateOnly(report.reportDate), tickets, scope);
  }

  private async exportQuotaSummary(
    reportId: string,
    scope: QuotaScope,
    subsidy: number,
    q?: string,
  ) {
    const rows = sortQuotaRows(
      filterQuotaRows(await this.loadQuotaRows(reportId, scope), q),
      undefined,
      undefined,
      scope,
    );
    const weekly = scope === 'weekly';
    const sheetName = weekly ? 'سهمیه هفتگی مازاد' : 'سهمیه شخصی مازاد';
    const amount = Math.max(0, subsidy);
    return buildStyledExcelExport({
      sheetName,
      fileName: `${sheetName}.xlsx`,
      columns: [
        ...(weekly ? [{ header: 'هفته', key: 'week', width: 22 }] : []),
        { header: 'کد ملی', key: 'nationalId', width: 16 },
        { header: 'تعداد کل', key: 'total', width: 14 },
        { header: 'مجاز', key: 'allowed', width: 12 },
        { header: 'غیرمجاز', key: 'unauthorized', width: 12 },
        { header: 'مبلغ غیرمجاز', key: 'unauthorizedAmount', width: 16 },
        { header: 'وضعیت', key: 'status', width: 14 },
      ],
      rows: rows.map((row) => ({
        ...(weekly
          ? {
              week:
                row.weekStart && row.weekEnd
                  ? formatWeekLabel(row.weekStart, row.weekEnd)
                  : '',
            }
          : {}),
        nationalId: row.nationalId,
        total: row.total,
        allowed: row.allowed,
        unauthorized: row.unauthorized,
        unauthorizedAmount: row.unauthorized * amount,
        status: row.status === 'violation' ? 'تخلف' : 'مجاز',
      })),
    });
  }

  private async exportAllTickets(
    reportId: string,
    query: ExportPortTicketSalesQueryDto,
  ) {
    await this.assertExists(reportId);
    const items = await this.prisma.portTicketSale.findMany({
      where: {
        reportId,
        qeshmondiStatus: query.qeshmondiStatus,
        OR: query.q
          ? [
              { nationalId: containsInsensitive(toLatinDigits(query.q)) },
              { passportNumber: containsInsensitive(query.q) },
              { fullName: containsInsensitive(query.q) },
              { firstName: containsInsensitive(query.q) },
              { lastName: containsInsensitive(query.q) },
              { ticketNumber: containsInsensitive(query.q) },
              { phone: containsInsensitive(toLatinDigits(query.q)) },
            ]
          : undefined,
      },
      orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }],
      select: ticketSelect,
    });
    const nationalIds = [
      ...new Set(
        items
          .map((item) => item.nationalId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const expiryByNationalId = new Map<string, string | null>();
    for (const chunk of chunkItems(nationalIds, 500)) {
      const found = await this.prisma.user.findMany({
        where: { nationalId: { in: chunk } },
        select: { nationalId: true, qeshmondiEndDate: true },
      });
      for (const user of found) {
        if (user.nationalId) {
          expiryByNationalId.set(user.nationalId, toTehranIsoDateOnly(user.qeshmondiEndDate));
        }
      }
    }
    const sheetName = 'کل بلیط‌های فروخته‌شده';
    return buildStyledExcelExport({
      sheetName,
      fileName: `${sheetName}.xlsx`,
      columns: [
        { header: 'شماره بلیت', key: 'ticketNumber', width: 16 },
        { header: 'کد ملی', key: 'nationalId', width: 16 },
        { header: 'پاسپورت', key: 'passportNumber', width: 16 },
        { header: 'نام مسافر', key: 'fullName', width: 28 },
        { header: 'تاریخ انقضای شهروندی', key: 'qeshmondiEndDate', width: 22 },
        { header: 'تاریخ حرکت', key: 'travelDate', width: 16 },
        { header: 'مبلغ', key: 'amount', width: 14 },
      ],
      rows: items.map((item) => ({
        ticketNumber: item.ticketNumber ?? '',
        nationalId: item.nationalId ?? '',
        passportNumber: item.passportNumber ?? '',
        fullName: item.fullName ?? '',
        qeshmondiEndDate: qeshmondiExpiryCell(
          item.nationalId,
          item.nationalId ? (expiryByNationalId.get(item.nationalId) ?? null) : null,
        ),
        travelDate: formatShamsiDate(toTehranIsoDateOnly(item.travelDate)),
        amount: item.amount ?? '',
      })),
    });
  }

  private async assertExists(id: string) {
    const found = await this.prisma.portSalesReport.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
  }

  private assertExcel(file?: UploadedExcel): UploadedExcel {
    if (!file?.buffer) {
      throw new BadRequestException('فایل اکسل ارسال نشده است');
    }
    if (file.size > MAX_PORT_SALES_EXCEL_BYTES) {
      throw new BadRequestException('حجم فایل اکسل بیش از حد مجاز است');
    }
    const name = file.originalname?.trim().toLowerCase() ?? '';
    const mime = normalizeDocumentType(file.mimetype, file.originalname);
    const excelMime =
      mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mime === 'application/vnd.ms-excel';
    if (!excelMime && !name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      throw new BadRequestException('فقط فایل اکسل با پسوند xlsx مجاز است');
    }
    return file;
  }
}
