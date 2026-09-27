import { randomUUID } from 'crypto';
import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { buildStyledExcelExport } from '../common/excel-export';
import { decodeUploadedFileName } from '../common/upload-filename';
import { parseIsoDate, toIsoDateOnly, toTehranIsoDateOnly } from '../common/iso-date';
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
import { PortTicketQeshmondiStatus, PortTicketStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortSalesReportDto } from './dto/create-port-sales-report.dto';
import {
  ExportPortTicketSalesQueryDto,
  type PortTicketExportGroup,
} from './dto/export-port-ticket-sales-query.dto';
import { FindPortSalesReportsQueryDto } from './dto/find-port-sales-reports-query.dto';
import { FindPortTicketSalesQueryDto } from './dto/find-port-ticket-sales-query.dto';
import { UpdatePortSalesReportDto } from './dto/update-port-sales-report.dto';
import {
  DEFAULT_PORT_DESTINATION,
  DEFAULT_PORT_ORIGIN,
  MAX_PORT_SALES_EXCEL_BYTES,
} from './port-sales.constants';
import { mapTicketStatus, parsePortTicketExcel, type PortTicketExcelRow } from './port-ticket-excel';

const NATIONAL_ID_PREFIX = '345';

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
    ticketStatus: row.ticketStatus,
    ticketStatusRaw: row.ticketStatusRaw,
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
  ticketStatus: true,
  ticketStatusRaw: true,
  qeshmondiStatus: true,
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

function ticketExportWhere(
  reportId: string,
  group: PortTicketExportGroup,
): Prisma.PortTicketSaleWhereInput {
  if (group === 'invalid') {
    return {
      reportId,
      qeshmondiStatus: PortTicketQeshmondiStatus.INVALID,
      ticketStatus: PortTicketStatus.IN_TRIP,
    };
  }
  if (group === 'cancelled') {
    return { reportId, ticketStatus: PortTicketStatus.OPERATOR_CANCELLED };
  }
  if (group === 'expired') {
    return { reportId, ticketStatus: PortTicketStatus.EXPIRED };
  }
  return {
    reportId,
    OR: [
      {
        qeshmondiStatus: PortTicketQeshmondiStatus.INVALID,
        ticketStatus: PortTicketStatus.IN_TRIP,
      },
      {
        ticketStatus: {
          in: [
            PortTicketStatus.OPERATOR_CANCELLED,
            PortTicketStatus.EXPIRED,
            PortTicketStatus.OTHER,
          ],
        },
      },
    ],
  };
}

function ticketExportSheetName(group: PortTicketExportGroup) {
  if (group === 'invalid') return 'قشموندی نامعتبر';
  if (group === 'cancelled') return 'ابطال اپراتور';
  if (group === 'expired') return 'پایان اعتبار';
  return 'جمع موارد فوق';
}

function ticketStatusLabel(status: PortTicketStatus) {
  if (status === PortTicketStatus.IN_TRIP) return 'در سفر';
  if (status === PortTicketStatus.OPERATOR_CANCELLED) return 'ابطال اپراتور';
  if (status === PortTicketStatus.EXPIRED) return 'پایان اعتبار';
  return 'سایر';
}

function qeshmondiStatusLabel(status: PortTicketQeshmondiStatus) {
  if (status === PortTicketQeshmondiStatus.VALID) return 'معتبر';
  if (status === PortTicketQeshmondiStatus.INVALID) return 'نامعتبر';
  return 'نامشخص';
}

function emptyStatusCounts(): Record<PortTicketStatus, number> {
  return {
    [PortTicketStatus.IN_TRIP]: 0,
    [PortTicketStatus.OPERATOR_CANCELLED]: 0,
    [PortTicketStatus.EXPIRED]: 0,
    [PortTicketStatus.OTHER]: 0,
  };
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
    await this.backfillTicketStatuses(id);
    const [grouped, prefixIds, validQeshmondiCount, invalidGrouped] = await Promise.all([
      this.prisma.portTicketSale.groupBy({
        by: ['ticketStatus'],
        where: { reportId: id },
        _count: { _all: true },
      }),
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
      this.prisma.portTicketSale.groupBy({
        by: ['ticketStatus'],
        where: {
          reportId: id,
          qeshmondiStatus: PortTicketQeshmondiStatus.INVALID,
        },
        _count: { _all: true },
      }),
    ]);
    const statusCounts = emptyStatusCounts();
    for (const row of grouped) {
      statusCounts[row.ticketStatus] = row._count._all;
    }
    const invalidStatusCounts = emptyStatusCounts();
    for (const row of invalidGrouped) {
      invalidStatusCounts[row.ticketStatus] = row._count._all;
    }
    const invalidQeshmondiCount = invalidStatusCounts[PortTicketStatus.IN_TRIP];
    const invalidQeshmondiTotal =
      invalidQeshmondiCount +
      statusCounts[PortTicketStatus.OPERATOR_CANCELLED] +
      statusCounts[PortTicketStatus.EXPIRED] +
      statusCounts[PortTicketStatus.OTHER];
    return {
      ...serializeReport(item),
      statusCounts,
      nationalIdPrefix: NATIONAL_ID_PREFIX,
      nationalIdPrefixCount: prefixIds.length,
      validQeshmondiCount,
      invalidQeshmondiCount,
      invalidQeshmondiTotal,
    };
  }

  async findTickets(reportId: string, query: FindPortTicketSalesQueryDto) {
    await this.assertExists(reportId);
    await this.backfillTicketStatuses(reportId);
    const where: Prisma.PortTicketSaleWhereInput = {
      reportId,
      ticketStatus: query.ticketStatus,
      qeshmondiStatus: query.qeshmondiStatus,
      OR: query.q
        ? [
            { nationalId: containsInsensitive(query.q) },
            { fullName: containsInsensitive(query.q) },
            { firstName: containsInsensitive(query.q) },
            { lastName: containsInsensitive(query.q) },
            { ticketNumber: containsInsensitive(query.q) },
            { phone: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.PortTicketSaleOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        ticketNumber: (dir) => ({ ticketNumber: dir }),
        nationalId: (dir) => ({ nationalId: dir }),
        fullName: (dir) => ({ fullName: dir }),
        ticketStatus: (dir) => ({ ticketStatus: dir }),
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

  async exportTickets(reportId: string, query: ExportPortTicketSalesQueryDto) {
    await this.assertExists(reportId);
    await this.backfillTicketStatuses(reportId);
    const items = await this.prisma.portTicketSale.findMany({
      where: ticketExportWhere(reportId, query.group),
      orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }],
      select: ticketSelect,
    });
    const sheetName = ticketExportSheetName(query.group);
    return buildStyledExcelExport({
      sheetName,
      fileName: `${sheetName}.xlsx`,
      columns: [
        { header: 'شماره بلیت', key: 'ticketNumber', width: 16 },
        { header: 'کد ملی', key: 'nationalId', width: 16 },
        { header: 'نام مسافر', key: 'fullName', width: 28 },
        { header: 'وضعیت', key: 'ticketStatus', width: 18 },
        { header: 'قشموندی', key: 'qeshmondiStatus', width: 14 },
        { header: 'تاریخ حرکت', key: 'travelDate', width: 16 },
        { header: 'مبلغ', key: 'amount', width: 14 },
      ],
      rows: items.map((item) => ({
        ticketNumber: item.ticketNumber ?? '',
        nationalId: item.nationalId ?? '',
        fullName: item.fullName ?? '',
        ticketStatus: ticketStatusLabel(item.ticketStatus),
        qeshmondiStatus: qeshmondiStatusLabel(item.qeshmondiStatus),
        travelDate: toTehranIsoDateOnly(item.travelDate) ?? '',
        amount: item.amount ?? '',
      })),
    });
  }

  async beginCreate(dto: CreatePortSalesReportDto, file?: UploadedExcel) {
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
      select: { id: true, nationalId: true, travelDate: true },
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

    return this.findOne(id);
  }

  async update(id: string, dto: UpdatePortSalesReportDto) {
    await this.assertExists(id);
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

  private async backfillTicketStatuses(reportId: string) {
    const others = await this.prisma.portTicketSale.findMany({
      where: { reportId, ticketStatus: PortTicketStatus.OTHER },
      select: { id: true, ticketStatusRaw: true },
    });
    const byStatus = new Map<PortTicketStatus, string[]>();
    for (const row of others) {
      const next = mapTicketStatus(row.ticketStatusRaw);
      if (next === PortTicketStatus.OTHER) continue;
      const ids = byStatus.get(next) ?? [];
      ids.push(row.id);
      byStatus.set(next, ids);
    }
    for (const [ticketStatus, ids] of byStatus) {
      await this.prisma.portTicketSale.updateMany({
        where: { id: { in: ids } },
        data: { ticketStatus },
      });
    }
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
