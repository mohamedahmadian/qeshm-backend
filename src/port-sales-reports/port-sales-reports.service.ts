import { randomUUID } from 'crypto';
import {
  BadRequestException,
  HttpException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { STAKEHOLDERS_ADMIN_ROLE_CODE } from '../access/access.constants';
import { buildStyledExcelExport } from '../common/excel-export';
import { gregorianToJalali, jalaliPartsToIso } from '../common/jalali-date';
import { getRequestLocale } from '../common/request-locale';
import { decodeUploadedFileName } from '../common/upload-filename';
import {
  addDaysIso,
  parseIsoDate,
  startOfIranWeekIso,
  toIsoDateOnly,
  todayIsoDateTehran,
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
import {
  PortSalesReportApprovalStatus,
  PortTicketQeshmondiStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortSalesReportDto } from './dto/create-port-sales-report.dto';
import { ExportPortTicketSalesQueryDto } from './dto/export-port-ticket-sales-query.dto';
import { FindPortSalesReportsQueryDto } from './dto/find-port-sales-reports-query.dto';
import { FindCitizenTrafficQueryDto } from './dto/find-citizen-traffic-query.dto';
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
/** سهمیهٔ هفتگی کسی که در جدول کاربران نیست؛ هم‌اندازهٔ پیش‌فرض `individualTicketQuota`. */
const DEFAULT_WEEKLY_TICKET_QUOTA = 1;

type WeeklyQuotaOf = (nationalId: string) => number;

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

type CitizenQuotaItem = QuotaRow & {
  amount: number;
  reportId: string;
  reportDate: string | null;
  origin: string | null;
  destination: string | null;
};

const TICKET_INSERT_CHUNK = 400;
const IMPORT_JOB_TTL_MS = 30 * 60 * 1000;

type ImportJobPhase = 'parsing' | 'saving' | 'done' | 'error';

export type PortSalesActor = {
  id: string;
  isAdmin?: boolean;
  roleCodes?: string[];
};

export function canSeeAllPortSalesReports(actor: PortSalesActor) {
  return Boolean(actor.isAdmin || actor.roleCodes?.includes(STAKEHOLDERS_ADMIN_ROLE_CODE));
}

function requireActor(actor?: PortSalesActor): PortSalesActor {
  if (!actor?.id) throw new UnauthorizedException();
  return actor;
}

const APPROVED_LOCK_MESSAGE = 'گزارش تأییدشده قابل ویرایش یا حذف نیست';

function monthTakenMessage(approved: boolean) {
  return approved
    ? 'گزارش این ماه برای همین مبدأ و مقصد تأیید شده است و بارگذاری گزارش دیگری ممکن نیست'
    : 'برای این ماه و همین مبدأ و مقصد قبلاً گزارش ثبت کرده‌اید. تا پیش از تأیید می‌توانید آن را حذف و گزارش جدید بارگذاری کنید';
}

function assertManager(actor?: PortSalesActor) {
  const current = requireActor(actor);
  if (!canSeeAllPortSalesReports(current)) {
    throw new ForbiddenException('فقط مدیریت می‌تواند این کار را انجام دهد');
  }
  return current;
}

/** کاربر عادی فقط گزارش‌های خودش را می‌بیند؛ مدیریت همه را. */
function reportScope(actor?: PortSalesActor): Prisma.PortSalesReportWhereInput {
  const current = requireActor(actor);
  return canSeeAllPortSalesReports(current) ? {} : { createdById: current.id };
}

type ImportJob = {
  id: string;
  userId: string;
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
  route: { origin: string; destination: string },
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
    origin: route.origin,
    destination: route.destination,
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
  nationalIdPrefixCount: true,
  validQeshmondiCount: true,
  invalidQeshmondiCount: true,
  weeklyQuotaExcessCount: true,
  invalidQeshmondiSubsidy: true,
  weeklyQuotaExcessSubsidy: true,
  allocatedSubsidy: true,
  allocatedSubsidyNote: true,
  quotaSnapshotReady: true,
  reportYear: true,
  reportMonth: true,
  approvalStatus: true,
  verifiedAt: true,
  approvedAt: true,
  approvedById: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  file: { select: fileSelect },
  createdBy: { select: { id: true, fullName: true } },
  approvedBy: { select: { id: true, fullName: true } },
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
    approvedAt?: Date | null;
    verifiedAt?: Date | null;
    originalFileName?: string;
    file?: { originalName?: string | null } | null;
    allocatedSubsidy?: bigint | number | null;
  },
>(item: T) {
  return {
    ...item,
    allocatedSubsidy:
      item.allocatedSubsidy == null ? null : Number(item.allocatedSubsidy),
    approvedAt: item.approvedAt instanceof Date ? item.approvedAt.toISOString() : (item.approvedAt ?? null),
    verifiedAt: item.verifiedAt instanceof Date ? item.verifiedAt.toISOString() : (item.verifiedAt ?? null),
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

function ticketTravelDateFilter(from?: string, to?: string) {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: parseIsoDate(from) } : {}),
    ...(to ? { lte: parseIsoDate(to) } : {}),
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
  quotaOf: WeeklyQuotaOf,
) {
  const groups = new Map<
    string,
    { nationalId: string; items: { id: string; iso: string; rowNumber: number }[] }
  >();
  for (const ticket of tickets) {
    if (!ticket.nationalId) continue;
    const iso = toTehranIsoDateOnly(ticket.travelDate) ?? reportIso;
    if (!iso) continue;
    const week = startOfIranWeekIso(iso);
    const key = `${week}\n${ticket.nationalId}`;
    const placed = { id: ticket.id, iso, rowNumber: ticket.rowNumber ?? 0 };
    const group = groups.get(key);
    if (group) group.items.push(placed);
    else groups.set(key, { nationalId: ticket.nationalId, items: [placed] });
  }
  const excessIds: string[] = [];
  for (const { nationalId, items } of groups.values()) {
    const limit = quotaOf(nationalId);
    if (items.length <= limit) continue;
    items.sort(
      (a, b) => a.iso.localeCompare(b.iso) || a.rowNumber - b.rowNumber || a.id.localeCompare(b.id),
    );
    for (const ticket of items.slice(limit)) excessIds.push(ticket.id);
  }
  return { excessIds };
}

function aggregateWeeklyQuota(
  reportIso: string | null,
  tickets: { nationalId: string | null; travelDate: Date | null }[],
  quotaOf: WeeklyQuotaOf,
): QuotaRow[] {
  const buckets = new Map<string, { weekStart: string; nationalId: string; total: number }>();
  for (const ticket of tickets) {
    if (!ticket.nationalId) continue;
    const iso = toTehranIsoDateOnly(ticket.travelDate) ?? reportIso;
    if (!iso) continue;
    const weekStart = startOfIranWeekIso(iso);
    const key = `${weekStart}\n${ticket.nationalId}`;
    const current = buckets.get(key);
    if (current) {
      current.total += 1;
    } else {
      buckets.set(key, { weekStart, nationalId: ticket.nationalId, total: 1 });
    }
  }
  const rows: QuotaRow[] = [];
  for (const bucket of buckets.values()) {
    const allowed = Math.min(bucket.total, quotaOf(bucket.nationalId));
    const unauthorized = bucket.total - allowed;
    rows.push({
      weekStart: bucket.weekStart,
      weekEnd: addDaysIso(bucket.weekStart, 6),
      nationalId: bucket.nationalId,
      total: bucket.total,
      allowed,
      unauthorized,
      status: unauthorized > 0 ? 'violation' : 'allowed',
    });
  }
  return rows;
}

function personalQuotaFromWeekly(weekly: QuotaRow[]): QuotaRow[] {
  const people = new Map<
    string,
    { nationalId: string; total: number; allowed: number; unauthorized: number }
  >();
  for (const row of weekly) {
    const current = people.get(row.nationalId);
    if (current) {
      current.total += row.total;
      current.allowed += row.allowed;
      current.unauthorized += row.unauthorized;
    } else {
      people.set(row.nationalId, {
        nationalId: row.nationalId,
        total: row.total,
        allowed: row.allowed,
        unauthorized: row.unauthorized,
      });
    }
  }
  return [...people.values()].map((person) => ({
    weekStart: null,
    weekEnd: null,
    nationalId: person.nationalId,
    total: person.total,
    allowed: person.allowed,
    unauthorized: person.unauthorized,
    status: person.unauthorized > 0 ? 'violation' : 'allowed',
  }));
}

const QUOTA_SORT_FIELDS = [
  'week',
  'nationalId',
  'total',
  'allowed',
  'unauthorized',
  'amount',
  'status',
] as const;

function quotaSortChoice(
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc' | undefined,
  q?: string,
) {
  const active =
    Boolean(sortBy) &&
    (sortDir === 'asc' || sortDir === 'desc') &&
    QUOTA_SORT_FIELDS.includes(sortBy as (typeof QUOTA_SORT_FIELDS)[number]);
  const hasNationalId = Boolean(toLatinDigits(q?.trim() ?? '').replace(/\D/g, ''));
  const field = active ? (sortBy as (typeof QUOTA_SORT_FIELDS)[number]) : hasNationalId ? 'week' : 'unauthorized';
  const dir: Prisma.SortOrder = active ? (sortDir === 'desc' ? 'desc' : 'asc') : hasNationalId ? 'asc' : 'desc';
  return { field, dir };
}

function weeklyQuotaOrderBy(
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc' | undefined,
  q?: string,
): Prisma.PortTicketWeeklyQuotaOrderByWithRelationInput[] {
  const { field, dir } = quotaSortChoice(sortBy, sortDir, q);
  const byWeek = { weekStart: 'asc' as const };
  const byNationalId = { nationalId: 'asc' as const };
  const byId = { id: 'asc' as const };
  switch (field) {
    case 'week':
      return [{ weekStart: dir }, byNationalId, byId];
    case 'nationalId':
      return [{ nationalId: dir }, byWeek, byId];
    case 'total':
      return [{ total: dir }, byWeek, byNationalId, byId];
    case 'allowed':
      return [{ allowed: dir }, byWeek, byNationalId, byId];
    default:
      return [{ unauthorized: dir }, byWeek, byNationalId, byId];
  }
}

function compareCitizenQuota(
  left: CitizenQuotaItem,
  right: CitizenQuotaItem,
  sortBy: string,
  sortDir: 'asc' | 'desc',
) {
  const sign = sortDir === 'desc' ? -1 : 1;
  const text = (a: string, b: string) => a.localeCompare(b) * sign;
  const num = (a: number, b: number) => (a - b) * sign;
  let diff = 0;
  switch (sortBy) {
    case 'week':
      diff = text(left.weekStart ?? '', right.weekStart ?? '');
      break;
    case 'report':
      diff = text(left.reportDate ?? '', right.reportDate ?? '');
      break;
    case 'nationalId':
      diff = text(left.nationalId, right.nationalId);
      break;
    case 'total':
      diff = num(left.total, right.total);
      break;
    case 'allowed':
      diff = num(left.allowed, right.allowed);
      break;
    case 'amount':
      diff = num(left.amount, right.amount);
      break;
    case 'status':
      diff = text(left.status, right.status);
      break;
    default:
      diff = num(left.unauthorized, right.unauthorized);
      break;
  }
  if (diff !== 0) return diff;
  return (
    (left.reportDate ?? '').localeCompare(right.reportDate ?? '') ||
    (left.weekStart ?? '').localeCompare(right.weekStart ?? '') ||
    left.reportId.localeCompare(right.reportId)
  );
}

function personalQuotaOrderBy(
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc' | undefined,
  q?: string,
): Prisma.PortTicketPersonalQuotaOrderByWithRelationInput[] {
  const { field, dir } = quotaSortChoice(sortBy, sortDir, q);
  const byNationalId = { nationalId: 'asc' as const };
  const byId = { id: 'asc' as const };
  switch (field) {
    case 'week':
    case 'nationalId':
      return [{ nationalId: dir }, byId];
    case 'total':
      return [{ total: dir }, byNationalId, byId];
    case 'allowed':
      return [{ allowed: dir }, byNationalId, byId];
    default:
      return [{ unauthorized: dir }, byNationalId, byId];
  }
}

function quotaNationalIdFilter(q?: string) {
  const raw = q?.trim() ?? '';
  if (!raw) return { nationalId: undefined as Prisma.StringFilter | undefined };
  const needle = toLatinDigits(raw).replace(/\D/g, '');
  if (!needle) return null;
  return { nationalId: { contains: needle } satisfies Prisma.StringFilter };
}

function jalaliParts(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  return gregorianToJalali(year, month, day);
}

function currentJalaliParts() {
  return jalaliParts(todayIsoDateTehran());
}

function reportMonthKey(iso: string) {
  const parts = jalaliParts(iso);
  return { reportYear: parts.year, reportMonth: parts.month };
}

function firstOfReportMonth(iso: string) {
  const parts = jalaliParts(iso);
  const first = jalaliPartsToIso(parts.year, parts.month, 1);
  if (!first) {
    throw new BadRequestException('تاریخ گزارش فروش معتبر نیست');
  }
  return first;
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
  /** زنجیرهٔ ساخت سهمیه برای هر گزارش تا دو درخواست همزمان جدول بلیط را دو بار نخوانند. */
  private readonly quotaSnapshotJobs = new Map<string, Promise<void>>();

  constructor(private readonly prisma: PrismaService) {}

  /** کار سهمیه را پشت کار در جریان همان گزارش می‌چیند. */
  private enqueueQuotaWork(reportId: string, work: () => Promise<void>): Promise<void> {
    const previous = this.quotaSnapshotJobs.get(reportId) ?? Promise.resolve();
    const tracked = previous
      .catch(() => undefined)
      .then(work)
      .finally(() => {
        if (this.quotaSnapshotJobs.get(reportId) === tracked) {
          this.quotaSnapshotJobs.delete(reportId);
        }
      });
    this.quotaSnapshotJobs.set(reportId, tracked);
    return tracked;
  }

  async findAll(actor: PortSalesActor | undefined, query: FindPortSalesReportsQueryDto) {
    const where: Prisma.PortSalesReportWhereInput = {
      ...reportScope(actor),
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
        createdBy: (dir) => ({ createdBy: { fullName: dir } }),
        approvalStatus: (dir) => ({ approvalStatus: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.portSalesReport.findMany({
        where,
        orderBy,
        select: reportSelect,
      });
      return this.withIndividualSubsidy(items.map(serializeReport));
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
    return paginatedResult(
      await this.withIndividualSubsidy(items.map(serializeReport)),
      total,
      page,
      pageSize,
    );
  }

  /** یارانهٔ فردی تعرفهٔ سال گزارش را به هر ردیف فهرست وصل می‌کند. */
  private async withIndividualSubsidy<T extends { reportYear: number }>(items: T[]) {
    const years = [...new Set(items.map((item) => item.reportYear))];
    const tariffs = years.length
      ? await this.prisma.ticketTariff.findMany({
          where: { year: { in: years } },
          select: { year: true, individualSubsidy: true },
        })
      : [];
    const subsidyByYear = new Map(tariffs.map((tariff) => [tariff.year, tariff.individualSubsidy]));
    return items.map((item) => ({
      ...item,
      tariffYear: item.reportYear,
      individualSubsidy: subsidyByYear.get(item.reportYear) ?? null,
    }));
  }

  /** کاربرانی که گزارش بررسی‌شده دارند؛ فقط مدیریت و مدیر ماژول درگاه. */
  async subsidyUsers(actor: PortSalesActor | undefined) {
    assertManager(actor);
    return this.prisma.user.findMany({
      where: { portSalesReports: { some: { verifiedAt: { not: null } } } },
      select: { id: true, fullName: true },
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
    });
  }

  /**
   * یارانهٔ گزارش‌های بررسی‌شده به تفکیک ماه جلالی.
   * کاربر عادی فقط گزارش خودش را می‌بیند. مدیریت و مدیر ماژول درگاه
   * با `userId` یک کاربر و بدون آن جمع همه کاربران را می‌بینند.
   * سال و ماه فقط جمع‌ها و نمودار را محدود می‌کنند؛ آخرین یارانه مستقل از این دو است.
   * یارانهٔ بلیط فردی و خودرویی از تعرفهٔ سال انتخاب‌شده است؛ بدون فیلتر سال، سال جاری جلالی.
   */
  async mySubsidies(
    actor: PortSalesActor | undefined,
    year?: number,
    userId?: string,
    month?: number,
  ) {
    const current = requireActor(actor);
    const manager = canSeeAllPortSalesReports(current);
    const createdById = manager ? userId : current.id;
    const reports = await this.prisma.portSalesReport.findMany({
      where: {
        verifiedAt: { not: null },
        ...(createdById ? { createdById } : {}),
      },
      select: {
        reportYear: true,
        reportMonth: true,
        validQeshmondiCount: true,
        invalidQeshmondiCount: true,
        weeklyQuotaExcessCount: true,
        invalidQeshmondiSubsidy: true,
        weeklyQuotaExcessSubsidy: true,
        allocatedSubsidy: true,
      },
      orderBy: [{ reportYear: 'asc' }, { reportMonth: 'asc' }],
    });
    const years = [...new Set(reports.map((item) => item.reportYear))].sort((a, b) => b - a);
    const tariffs = years.length
      ? await this.prisma.ticketTariff.findMany({
          where: { year: { in: years } },
          select: { year: true, individualSubsidy: true },
        })
      : [];
    const rateByYear = new Map(tariffs.map((item) => [item.year, item.individualSubsidy]));
    const byKey = new Map<
      string,
      {
        year: number;
        month: number;
        received: number;
        allocated: number;
        count: number;
        invalidQeshmondi: number;
        weeklyExcess: number;
        invalidTotal: number;
      }
    >();
    for (const report of reports) {
      const rate = rateByYear.get(report.reportYear) ?? 0;
      const invalidQeshmondi =
        report.invalidQeshmondiSubsidy ?? report.invalidQeshmondiCount * rate;
      const weeklyExcess =
        report.weeklyQuotaExcessSubsidy ?? report.weeklyQuotaExcessCount * rate;
      const key = `${report.reportYear}-${report.reportMonth}`;
      const currentMonth = byKey.get(key);
      const received = report.validQeshmondiCount * rate;
      const allocated =
        report.allocatedSubsidy != null ? Number(report.allocatedSubsidy) : received;
      byKey.set(key, {
        year: report.reportYear,
        month: report.reportMonth,
        received: (currentMonth?.received ?? 0) + received,
        allocated: (currentMonth?.allocated ?? 0) + allocated,
        count: (currentMonth?.count ?? 0) + 1,
        invalidQeshmondi: (currentMonth?.invalidQeshmondi ?? 0) + invalidQeshmondi,
        weeklyExcess: (currentMonth?.weeklyExcess ?? 0) + weeklyExcess,
        invalidTotal: (currentMonth?.invalidTotal ?? 0) + invalidQeshmondi + weeklyExcess,
      });
    }
    const ordered = [...byKey.values()].sort((a, b) => a.year - b.year || a.month - b.month);
    const withChange = (item: (typeof ordered)[number], reported: boolean) => {
      const previousMonth = item.month === 1 ? 12 : item.month - 1;
      const previousYear = item.month === 1 ? item.year - 1 : item.year;
      const previous = byKey.get(`${previousYear}-${previousMonth}`);
      const previousAllocated = previous?.allocated;
      const changeAmount =
        previousAllocated == null ? null : item.allocated - previousAllocated;
      const changePercent =
        previousAllocated == null || previousAllocated === 0
          ? null
          : Math.round(((item.allocated - previousAllocated) / previousAllocated) * 1000) / 10;
      return { ...item, reported, changeAmount, changePercent };
    };
    const latest = ordered.length ? ordered[ordered.length - 1] : null;
    const matched = ordered.filter(
      (item) => (year == null || item.year === year) && (month == null || item.month === month),
    );
    const totals = matched.reduce(
      (sum, item) => ({
        received: sum.received + item.received,
        invalidQeshmondi: sum.invalidQeshmondi + item.invalidQeshmondi,
        weeklyExcess: sum.weeklyExcess + item.weeklyExcess,
      }),
      { received: 0, invalidQeshmondi: 0, weeklyExcess: 0 },
    );
    const today = currentJalaliParts();
    const jalaliYear = today.year;
    const monthsOfYear = (itemYear: number) =>
      Array.from({ length: 12 }, (_, index) => {
        const itemMonth = index + 1;
        return (
          byKey.get(`${itemYear}-${itemMonth}`) ?? {
            year: itemYear,
            month: itemMonth,
            received: 0,
            allocated: 0,
            count: 0,
            invalidQeshmondi: 0,
            weeklyExcess: 0,
            invalidTotal: 0,
          }
        );
      });
    const chartYears =
      month != null
        ? []
        : year != null
          ? [year]
          : years.length
            ? Array.from(
                { length: Math.max(...years) - Math.min(...years) + 1 },
                (_, index) => Math.min(...years) + index,
              )
            : [jalaliYear];
    const chartSpan = month != null ? matched : chartYears.flatMap((itemYear) => monthsOfYear(itemYear));
    const tariffYear = year ?? jalaliYear;
    const yearTariff = await this.prisma.ticketTariff.findUnique({
      where: { year: tariffYear },
      select: { individualSubsidy: true, vehicleSubsidy: true },
    });
    return {
      years,
      count: reports.length,
      latest: latest
        ? { amount: latest.received, year: latest.year, month: latest.month }
        : null,
      ticketSubsidies: {
        year: tariffYear,
        individual: yearTariff?.individualSubsidy ?? null,
        vehicle: yearTariff?.vehicleSubsidy ?? null,
      },
      totals,
      currentYear: jalaliYear,
      currentMonth: today.month,
      yearMonths: Array.from({ length: today.month }, (_, index) => {
        const itemMonth = index + 1;
        const item = byKey.get(`${jalaliYear}-${itemMonth}`);
        return {
          month: itemMonth,
          count: item?.count ?? 0,
          allocated: item?.allocated ?? 0,
        };
      }),
      months: chartSpan.map((item) =>
        withChange(item, byKey.has(`${item.year}-${item.month}`)),
      ),
    };
  }

  async findOne(actor: PortSalesActor | undefined, id: string) {
    await this.assertExists(actor, id);
    const item = await this.prisma.portSalesReport.findUnique({
      where: { id },
      select: reportSelect,
    });
    if (!item) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    const reportIso = toTehranIsoDateOnly(item.reportDate);
    const tariffYear = reportIso ? jalaliParts(reportIso).year : null;
    const tariff = tariffYear
      ? await this.prisma.ticketTariff.findUnique({
          where: { year: tariffYear },
          select: { individualSubsidy: true },
        })
      : null;
    return {
      ...serializeReport(item),
      nationalIdPrefix: NATIONAL_ID_PREFIX,
      tariffYear,
      individualSubsidy: tariff?.individualSubsidy ?? null,
    };
  }

  async findTickets(
    actor: PortSalesActor | undefined,
    reportId: string,
    query: FindPortTicketSalesQueryDto,
  ) {
    await this.assertExists(actor, reportId);
    const where: Prisma.PortTicketSaleWhereInput = {
      reportId,
      qeshmondiStatus: query.qeshmondiStatus,
      weeklyQuotaExcess: query.weeklyQuota === 'excess' ? true : undefined,
      travelDate: ticketTravelDateFilter(query.from, query.to),
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

  async findQuota(
    actor: PortSalesActor | undefined,
    reportId: string,
    query: FindPortTicketQuotaQueryDto,
  ) {
    await this.assertExists(actor, reportId);
    const { page, pageSize, skip, take } = paginationArgs(query);
    const nationalId = quotaNationalIdFilter(query.q);
    if (!nationalId) {
      return {
        ...paginatedResult([], 0, page, pageSize),
        unauthorizedTotal: 0,
      };
    }
    if (query.scope === 'personal') {
      const where: Prisma.PortTicketPersonalQuotaWhereInput = { reportId, ...nationalId };
      const [items, total, sum] = await Promise.all([
        this.prisma.portTicketPersonalQuota.findMany({
          where,
          orderBy: personalQuotaOrderBy(query.sortBy, query.sortDir, query.q),
          skip,
          take,
        }),
        this.prisma.portTicketPersonalQuota.count({ where }),
        this.prisma.portTicketPersonalQuota.aggregate({
          where,
          _sum: { unauthorized: true },
        }),
      ]);
      return {
        ...paginatedResult(
          items.map((row) => this.serializeQuotaRow(row)),
          total,
          page,
          pageSize,
        ),
        unauthorizedTotal: sum._sum.unauthorized ?? 0,
      };
    }
    const where: Prisma.PortTicketWeeklyQuotaWhereInput = { reportId, ...nationalId };
    const [items, total, sum] = await Promise.all([
      this.prisma.portTicketWeeklyQuota.findMany({
        where,
        orderBy: weeklyQuotaOrderBy(query.sortBy, query.sortDir, query.q),
        skip,
        take,
      }),
      this.prisma.portTicketWeeklyQuota.count({ where }),
      this.prisma.portTicketWeeklyQuota.aggregate({
        where,
        _sum: { unauthorized: true },
      }),
    ]);
    return {
      ...paginatedResult(
        items.map((row) => this.serializeQuotaRow(row)),
        total,
        page,
        pageSize,
      ),
      unauthorizedTotal: sum._sum.unauthorized ?? 0,
    };
  }

  async findCitizenTraffic(query: FindCitizenTrafficQueryDto) {
    const nationalId = query.nationalId;
    const [tripCount, groupedRoutes] = await Promise.all([
      this.prisma.portTicketSale.count({ where: { nationalId } }),
      this.prisma.portTicketSale.groupBy({
        by: ['origin', 'destination'],
        where: { nationalId },
        _count: { _all: true },
      }),
    ]);
    const routes = groupedRoutes
      .map((row) => ({
        origin: row.origin,
        destination: row.destination,
        count: row._count._all,
      }))
      .sort((left, right) => {
        const byCount = right.count - left.count;
        if (byCount) return byCount;
        const byOrigin = (left.origin ?? '').localeCompare(right.origin ?? '', 'fa');
        if (byOrigin) return byOrigin;
        return (left.destination ?? '').localeCompare(right.destination ?? '', 'fa');
      });
    const scope = query.scope ?? 'all';
    if (scope === 'weekly' || scope === 'personal') {
      const page = await this.citizenQuotaPage(nationalId, scope, query);
      return { ...page, tripCount, routes, nationalIdPrefix: NATIONAL_ID_PREFIX };
    }
    const tickets = await this.citizenTicketPage(nationalId, query, tripCount);
    return { ...tickets, tripCount, routes, nationalIdPrefix: NATIONAL_ID_PREFIX };
  }

  private async citizenTicketPage(
    nationalId: string,
    query: FindCitizenTrafficQueryDto,
    total: number,
  ) {
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
        travelDate: (dir) => [{ travelDate: dir }, { travelTime: dir }],
        origin: (dir) => ({ origin: dir }),
        destination: (dir) => ({ destination: dir }),
        amount: (dir) => ({ amount: dir }),
        rowNumber: (dir) => ({ rowNumber: dir }),
      },
      [{ travelDate: 'asc' }, { travelTime: 'asc' }, { id: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, user] = await Promise.all([
      this.prisma.portTicketSale.findMany({
        where: { nationalId },
        orderBy,
        skip,
        take,
        select: ticketSelect,
      }),
      this.prisma.user.findUnique({
        where: { nationalId },
        select: { qeshmondiEndDate: true },
      }),
    ]);
    const qeshmondiEndDate = toTehranIsoDateOnly(user?.qeshmondiEndDate);
    return paginatedResult(
      items.map((item) => ({
        ...serializeTicket(item),
        qeshmondiEndDate,
      })),
      total,
      page,
      pageSize,
    );
  }

  private async citizenQuotaPage(
    nationalId: string,
    scope: 'weekly' | 'personal',
    query: FindCitizenTrafficQueryDto,
  ) {
    const reportSelect = {
      id: true,
      reportDate: true,
      reportYear: true,
      origin: true,
      destination: true,
    } as const;
    const where = { nationalId, report: { quotaSnapshotReady: true } };
    const weeklyRows =
      scope === 'weekly'
        ? await this.prisma.portTicketWeeklyQuota.findMany({
            where,
            select: {
              weekStart: true,
              nationalId: true,
              total: true,
              allowed: true,
              unauthorized: true,
              report: { select: reportSelect },
            },
          })
        : [];
    const personalRows =
      scope === 'personal'
        ? await this.prisma.portTicketPersonalQuota.findMany({
            where,
            select: {
              nationalId: true,
              total: true,
              allowed: true,
              unauthorized: true,
              report: { select: reportSelect },
            },
          })
        : [];
    const years = [
      ...new Set([
        ...weeklyRows.map((row) => row.report.reportYear),
        ...personalRows.map((row) => row.report.reportYear),
      ]),
    ];
    const tariffs = years.length
      ? await this.prisma.ticketTariff.findMany({
          where: { year: { in: years } },
          select: { year: true, individualSubsidy: true },
        })
      : [];
    const rateByYear = new Map(tariffs.map((tariff) => [tariff.year, tariff.individualSubsidy]));
    const toRow = (
      row: (typeof personalRows)[number],
      weekStart: string | null,
    ): CitizenQuotaItem => {
      const rate = rateByYear.get(row.report.reportYear) ?? null;
      return {
        weekStart,
        weekEnd: weekStart ? addDaysIso(weekStart, 6) : null,
        nationalId: row.nationalId,
        total: row.total,
        allowed: row.allowed,
        unauthorized: row.unauthorized,
        status: row.unauthorized > 0 ? 'violation' : 'allowed',
        amount: rate == null ? 0 : row.unauthorized * rate,
        reportId: row.report.id,
        reportDate: toTehranIsoDateOnly(row.report.reportDate),
        origin: row.report.origin,
        destination: row.report.destination,
      };
    };
    const rows: CitizenQuotaItem[] = [
      ...weeklyRows.map((row) => toRow(row, toIsoDateOnly(row.weekStart))),
      ...personalRows.map((row) => toRow(row, null)),
    ];
    const sortBy =
      query.sortBy && query.sortDir
        ? query.sortBy
        : scope === 'personal'
          ? 'unauthorized'
          : 'week';
    const sortDir =
      query.sortBy && query.sortDir ? query.sortDir : scope === 'personal' ? 'desc' : 'asc';
    rows.sort((left, right) => compareCitizenQuota(left, right, sortBy, sortDir));
    const { page, pageSize, skip, take } = paginationArgs(query);
    const unauthorizedTotal = rows.reduce((sum, row) => sum + row.unauthorized, 0);
    const unauthorizedAmount = rows.reduce((sum, row) => sum + row.amount, 0);
    return {
      ...paginatedResult(rows.slice(skip, skip + take), rows.length, page, pageSize),
      unauthorizedTotal,
      unauthorizedAmount,
    };
  }

  async exportTickets(
    actor: PortSalesActor | undefined,
    reportId: string,
    query: ExportPortTicketSalesQueryDto,
  ) {
    await this.assertExists(actor, reportId);
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

  async beginCreate(
    actor: PortSalesActor | undefined,
    dto: CreatePortSalesReportDto,
    file?: UploadedExcel,
  ) {
    const { id: userId } = requireActor(actor);
    const origin = normalizePortName(dto.origin || '') || DEFAULT_PORT_ORIGIN;
    const destination = normalizePortName(dto.destination || '') || DEFAULT_PORT_DESTINATION;
    assertDistinctPorts(origin, destination);
    await this.assertKnownPorts(origin, destination);
    const reportDate = firstOfReportMonth(dto.reportDate);
    const month = reportMonthKey(reportDate);
    await this.assertOwnerMonthFree(
      userId,
      month.reportYear,
      month.reportMonth,
      origin,
      destination,
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
      userId,
      phase: 'parsing',
      percent: 5,
      processed: 0,
      total: 0,
      updatedAt: Date.now(),
    });
    setImmediate(() => {
      void this.runImport(
        jobId,
        userId,
        { ...dto, reportDate },
        stored.buffer,
        savedFile.id,
        originalFileName,
      );
    });
    return { jobId };
  }

  importStatus(actor: PortSalesActor | undefined, jobId: string) {
    const { id: userId } = requireActor(actor);
    this.pruneJobs();
    const job = this.importJobs.get(jobId);
    if (!job || job.userId !== userId) {
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
    userId: string,
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
      let nationalIdPrefixCount = 0;
      for (const nationalId of uniqueNationalIds) {
        if (nationalId.startsWith(NATIONAL_ID_PREFIX)) nationalIdPrefixCount += 1;
      }
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
      const month = reportMonthKey(dto.reportDate);
      const origin = normalizePortName(dto.origin || '') || DEFAULT_PORT_ORIGIN;
      const destination = normalizePortName(dto.destination || '') || DEFAULT_PORT_DESTINATION;
      const created = await this.prisma.$transaction(
        async (tx) => {
          const clash = await tx.portSalesReport.findFirst({
            where: {
              createdById: userId,
              reportYear: month.reportYear,
              reportMonth: month.reportMonth,
              origin,
              destination,
            },
            select: { approvalStatus: true },
          });
          if (clash) {
            throw new BadRequestException(
              monthTakenMessage(clash.approvalStatus === PortSalesReportApprovalStatus.APPROVED),
            );
          }
          const report = await tx.portSalesReport.create({
            data: {
              reportDate: parseIsoDate(dto.reportDate),
              reportYear: month.reportYear,
              reportMonth: month.reportMonth,
              origin,
              destination,
              fileId,
              originalFileName,
              recordCount: rows.length,
              uniqueNationalIdCount: uniqueNationalIds.size,
              nationalIdPrefixCount,
              createdById: userId,
            },
            select: { id: true },
          });
          for (const chunk of chunkItems(rows, TICKET_INSERT_CHUNK)) {
            await tx.portTicketSale.createMany({
              data: chunk.map((row) =>
                toTicketCreateData(report.id, row, { origin, destination }),
              ),
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

  async verifyQeshmondi(actor: PortSalesActor | undefined, id: string) {
    const manager = assertManager(actor);
    const report = await this.prisma.portSalesReport.findFirst({
      where: { id, ...reportScope(manager) },
      select: { approvalStatus: true },
    });
    if (!report) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    await this.enqueueQuotaWork(id, () => this.writeQeshmondiVerification(manager, id));
    return this.findOne(manager, id);
  }

  async approve(actor: PortSalesActor | undefined, id: string) {
    const manager = assertManager(actor);
    const report = await this.prisma.portSalesReport.findFirst({
      where: { id, ...reportScope(manager) },
      select: { approvalStatus: true, verifiedAt: true },
    });
    if (!report) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    if (report.approvalStatus !== PortSalesReportApprovalStatus.APPROVED) {
      if (!report.verifiedAt) {
        throw new BadRequestException('ابتدا بررسی صحت قشموندی را انجام دهید');
      }
      await this.prisma.portSalesReport.update({
        where: { id },
        data: {
          approvalStatus: PortSalesReportApprovalStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: manager.id,
        },
      });
    }
    return this.findOne(manager, id);
  }

  async revokeApproval(actor: PortSalesActor | undefined, id: string) {
    const manager = assertManager(actor);
    const report = await this.prisma.portSalesReport.findFirst({
      where: { id, ...reportScope(manager) },
      select: { id: true },
    });
    if (!report) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    await this.prisma.portSalesReport.update({
      where: { id },
      data: {
        approvalStatus: PortSalesReportApprovalStatus.DRAFT,
        approvedAt: null,
        approvedById: null,
      },
    });
    return this.findOne(manager, id);
  }

  /** مبلغی که مدیریت تخصیص می‌دهد. تا قبل از ثبت، برابر یارانهٔ معتبر می‌ماند. */
  async allocateSubsidy(
    actor: PortSalesActor | undefined,
    id: string,
    amount: number,
    note?: string | null,
  ) {
    const manager = assertManager(actor);
    const report = await this.prisma.portSalesReport.findFirst({
      where: { id, ...reportScope(manager) },
      select: { id: true, verifiedAt: true },
    });
    if (!report) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    if (!report.verifiedAt) {
      throw new BadRequestException('ابتدا بررسی صحت قشموندی را انجام دهید');
    }
    await this.prisma.portSalesReport.update({
      where: { id },
      data: {
        allocatedSubsidy: BigInt(amount),
        allocatedSubsidyNote: note ?? null,
      },
    });
    return this.findOne(manager, id);
  }

  private async writeQeshmondiVerification(actor: PortSalesActor | undefined, id: string) {
    const report = await this.prisma.portSalesReport.findFirst({
      where: { id, ...reportScope(actor) },
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

    await this.persistQuotaSnapshot(id, reportIso, tickets, {
      force: true,
      markVerified: true,
      validQeshmondiCount: validIds.length,
      invalidQeshmondiCount: invalidIds.length,
    });
  }

  async update(actor: PortSalesActor | undefined, id: string, dto: UpdatePortSalesReportDto) {
    const current = await this.prisma.portSalesReport.findFirst({
      where: { id, ...reportScope(actor) },
      select: {
        origin: true,
        destination: true,
        reportDate: true,
        reportYear: true,
        reportMonth: true,
        approvalStatus: true,
        createdById: true,
      },
    });
    if (!current) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    this.assertMutable(actor, current.approvalStatus);
    const origin = normalizePortName(dto.origin ?? current.origin);
    const destination = normalizePortName(dto.destination ?? current.destination);
    assertDistinctPorts(origin, destination);
    await this.assertKnownPorts(origin, destination);
    const nextIso = dto.reportDate ? firstOfReportMonth(dto.reportDate) : undefined;
    const storedIso = toIsoDateOnly(current.reportDate);
    const currentFirst = storedIso ? firstOfReportMonth(storedIso) : null;
    const monthChanged = Boolean(nextIso && nextIso !== currentFirst);
    const month = monthChanged
      ? reportMonthKey(nextIso!)
      : { reportYear: current.reportYear, reportMonth: current.reportMonth };
    if (current.createdById) {
      await this.assertOwnerMonthFree(
        current.createdById,
        month.reportYear,
        month.reportMonth,
        origin,
        destination,
        id,
      );
    }
    if (!monthChanged) {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.portTicketSale.updateMany({
          where: { reportId: id },
          data: { origin, destination },
        });
        return tx.portSalesReport.update({
          where: { id },
          data: {
            origin,
            destination,
          },
          select: reportSelect,
        });
      });
      return serializeReport(updated);
    }
    const reportDate = nextIso!;
    let serialized: ReturnType<typeof serializeReport> | undefined;
    await this.enqueueQuotaWork(id, async () => {
      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.portTicketSale.updateMany({
          where: { reportId: id },
          data: {
            qeshmondiStatus: PortTicketQeshmondiStatus.UNKNOWN,
            weeklyQuotaExcess: false,
            origin,
            destination,
          },
        });
        await tx.portTicketWeeklyQuota.deleteMany({ where: { reportId: id } });
        await tx.portTicketPersonalQuota.deleteMany({ where: { reportId: id } });
        return tx.portSalesReport.update({
          where: { id },
          data: {
            reportDate: parseIsoDate(reportDate),
            reportYear: month.reportYear,
            reportMonth: month.reportMonth,
            origin,
            destination,
            validQeshmondiCount: 0,
            invalidQeshmondiCount: 0,
            weeklyQuotaExcessCount: 0,
            quotaSnapshotReady: false,
            verifiedAt: null,
            invalidQeshmondiSubsidy: null,
            weeklyQuotaExcessSubsidy: null,
            allocatedSubsidy: null,
            allocatedSubsidyNote: null,
          },
          select: reportSelect,
        });
      });
      serialized = serializeReport(updated);
    });
    return serialized!;
  }

  async remove(actor: PortSalesActor | undefined, id: string) {
    const item = await this.prisma.portSalesReport.findFirst({
      where: { id, ...reportScope(actor) },
      select: { id: true, fileId: true, approvalStatus: true },
    });
    if (!item) {
      throw new NotFoundException('گزارش فروش بنادر یافت نشد');
    }
    this.assertMutable(actor, item.approvalStatus);
    await this.enqueueQuotaWork(item.id, async () => {
      await this.prisma.$transaction(async (tx) => {
        await tx.portSalesReport.delete({ where: { id: item.id } });
        await tx.storedFile.delete({ where: { id: item.fileId } }).catch(() => undefined);
      });
    });
    return { ok: true };
  }

  async filePayload(actor: PortSalesActor | undefined, id: string) {
    const item = await this.prisma.portSalesReport.findFirst({
      where: { id, ...reportScope(actor) },
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

  private serializeQuotaRow(row: {
    weekStart?: Date | null;
    nationalId: string;
    total: number;
    allowed: number;
    unauthorized: number;
  }): QuotaRow {
    const weekStart = row.weekStart ? toIsoDateOnly(row.weekStart) : null;
    return {
      weekStart,
      weekEnd: weekStart ? addDaysIso(weekStart, 6) : null,
      nationalId: row.nationalId,
      total: row.total,
      allowed: row.allowed,
      unauthorized: row.unauthorized,
      status: row.unauthorized > 0 ? 'violation' : 'allowed',
    };
  }

  /** سهمیهٔ هفتگی هر کد ملی از `individualTicketQuota` کاربر؛ نبودِ کاربر = پیش‌فرض. */
  private async loadWeeklyQuotas(nationalIds: Iterable<string>): Promise<WeeklyQuotaOf> {
    const quotas = new Map<string, number>();
    for (const chunk of chunkItems([...new Set(nationalIds)], 500)) {
      const found = await this.prisma.user.findMany({
        where: { nationalId: { in: chunk } },
        select: { nationalId: true, individualTicketQuota: true },
      });
      for (const user of found) {
        if (user.nationalId) quotas.set(user.nationalId, Math.max(0, user.individualTicketQuota));
      }
    }
    return (nationalId) => quotas.get(nationalId) ?? DEFAULT_WEEKLY_TICKET_QUOTA;
  }

  private async persistQuotaSnapshot(
    reportId: string,
    reportIso: string | null,
    tickets: {
      id: string;
      nationalId: string | null;
      travelDate: Date | null;
      rowNumber: number | null;
    }[],
    counts?: {
      force?: boolean;
      markVerified?: boolean;
      validQeshmondiCount?: number;
      invalidQeshmondiCount?: number;
    },
  ) {
    const quotaOf = await this.loadWeeklyQuotas(
      tickets
        .map((ticket) => ticket.nationalId)
        .filter((value): value is string => Boolean(value)),
    );
    const { excessIds } = weeklyQuotaExcessInFile(reportIso, tickets, quotaOf);
    const weekly = aggregateWeeklyQuota(reportIso, tickets, quotaOf);
    const personal = personalQuotaFromWeekly(weekly);
    const weeklyExcess = weekly.reduce((sum, row) => sum + row.unauthorized, 0);
    const subsidy = counts?.markVerified ? await this.individualSubsidyForIso(reportIso) : null;
    const weeklyRows = weekly.filter((row) => row.unauthorized > 0 && row.weekStart);
    const personalRows = personal.filter((row) => row.unauthorized > 0);
    const timeout = Math.min(
      15 * 60 * 1000,
      Math.max(
        120_000,
        Math.ceil(
          (weeklyRows.length + personalRows.length + excessIds.length) / TICKET_INSERT_CHUNK,
        ) * 20_000,
      ),
    );
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "port_sales_reports" WHERE id = ${reportId} FOR UPDATE`;
        if (!counts?.force) {
          const locked = await tx.portSalesReport.findUnique({
            where: { id: reportId },
            select: { quotaSnapshotReady: true },
          });
          if (locked?.quotaSnapshotReady) return;
        }
        await tx.portTicketSale.updateMany({
          where: { reportId, weeklyQuotaExcess: true },
          data: { weeklyQuotaExcess: false },
        });
        for (const chunk of chunkItems(excessIds, TICKET_INSERT_CHUNK)) {
          await tx.portTicketSale.updateMany({
            where: { id: { in: chunk } },
            data: { weeklyQuotaExcess: true },
          });
        }
        await tx.portTicketWeeklyQuota.deleteMany({ where: { reportId } });
        await tx.portTicketPersonalQuota.deleteMany({ where: { reportId } });
        for (const chunk of chunkItems(weeklyRows, TICKET_INSERT_CHUNK)) {
          await tx.portTicketWeeklyQuota.createMany({
            data: chunk.map((row) => ({
              reportId,
              weekStart: parseIsoDate(row.weekStart!),
              nationalId: row.nationalId,
              total: row.total,
              allowed: row.allowed,
              unauthorized: row.unauthorized,
            })),
          });
        }
        for (const chunk of chunkItems(personalRows, TICKET_INSERT_CHUNK)) {
          await tx.portTicketPersonalQuota.createMany({
            data: chunk.map((row) => ({
              reportId,
              nationalId: row.nationalId,
              total: row.total,
              allowed: row.allowed,
              unauthorized: row.unauthorized,
            })),
          });
        }
        await tx.portSalesReport.update({
          where: { id: reportId },
          data: {
            weeklyQuotaExcessCount: weeklyExcess,
            quotaSnapshotReady: true,
            verifiedAt: counts?.markVerified ? new Date() : undefined,
            validQeshmondiCount: counts?.validQeshmondiCount,
            invalidQeshmondiCount: counts?.invalidQeshmondiCount,
            invalidQeshmondiSubsidy: counts?.markVerified
              ? subsidy == null
                ? null
                : (counts.invalidQeshmondiCount ?? 0) * subsidy
              : undefined,
            weeklyQuotaExcessSubsidy: counts?.markVerified
              ? subsidy == null
                ? null
                : weeklyExcess * subsidy
              : undefined,
          },
        });
      },
      { maxWait: 20_000, timeout },
    );
  }

  private async exportQuotaSummary(
    reportId: string,
    scope: QuotaScope,
    subsidy: number,
    q?: string,
  ) {
    const nationalId = quotaNationalIdFilter(q);
    const rows = !nationalId
      ? []
      : scope === 'personal'
        ? (
            await this.prisma.portTicketPersonalQuota.findMany({
              where: { reportId, ...nationalId },
              orderBy: personalQuotaOrderBy(undefined, undefined, q),
            })
          ).map((row) => this.serializeQuotaRow(row))
        : (
            await this.prisma.portTicketWeeklyQuota.findMany({
              where: { reportId, ...nationalId },
              orderBy: weeklyQuotaOrderBy(undefined, undefined, q),
            })
          ).map((row) => this.serializeQuotaRow(row));
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
    const items = await this.prisma.portTicketSale.findMany({
      where: {
        reportId,
        qeshmondiStatus: query.qeshmondiStatus,
        travelDate: ticketTravelDateFilter(query.from, query.to),
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
      orderBy: [{ travelDate: 'asc' }, { rowNumber: 'asc' }, { id: 'asc' }],
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
    const sheetName = 'بلیط‌های فروخته‌شده';
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

  /** بعد از تأیید فقط مدیریت و مدیر ماژول می‌توانند ویرایش یا حذف کنند. */
  private assertMutable(
    actor: PortSalesActor | undefined,
    status: PortSalesReportApprovalStatus,
  ) {
    if (status !== PortSalesReportApprovalStatus.APPROVED) return;
    const current = requireActor(actor);
    if (!canSeeAllPortSalesReports(current)) {
      throw new BadRequestException(APPROVED_LOCK_MESSAGE);
    }
  }

  private async individualSubsidyForIso(reportIso: string | null) {
    if (!reportIso) return null;
    const tariff = await this.prisma.ticketTariff.findUnique({
      where: { year: jalaliParts(reportIso).year },
      select: { individualSubsidy: true },
    });
    return tariff?.individualSubsidy ?? null;
  }

  private async assertKnownPorts(origin: string, destination: string) {
    const originName = normalizePortName(origin);
    const destinationName = normalizePortName(destination);
    const found = await this.prisma.port.findMany({
      where: {
        OR: [originName, destinationName].map((name) => ({
          name: { equals: name, mode: 'insensitive' },
        })),
      },
      select: { name: true },
    });
    const keys = new Set(found.map((item) => normalizePortName(item.name)));
    if (!keys.has(originName) || !keys.has(destinationName)) {
      throw new BadRequestException('مبدأ و مقصد باید از بنادر ثبت‌شده انتخاب شوند');
    }
  }

  private async assertOwnerMonthFree(
    userId: string,
    reportYear: number,
    reportMonth: number,
    origin: string,
    destination: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.portSalesReport.findFirst({
      where: {
        createdById: userId,
        reportYear,
        reportMonth,
        origin: normalizePortName(origin),
        destination: normalizePortName(destination),
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { approvalStatus: true },
    });
    if (!existing) return;
    throw new BadRequestException(
      monthTakenMessage(existing.approvalStatus === PortSalesReportApprovalStatus.APPROVED),
    );
  }

  private async assertExists(actor: PortSalesActor | undefined, id: string) {
    const found = await this.prisma.portSalesReport.findFirst({
      where: { id, ...reportScope(actor) },
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
