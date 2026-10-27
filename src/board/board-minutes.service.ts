import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { parseIsoDate, parseOptionalIsoDate, toIsoDateOnly } from '../common/iso-date';
import { gregorianToJalali } from '../common/jalali-date';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import {
  BoardMinutesAttachmentKind,
  BoardMinutesAttendance,
  BoardMinutesMemberKind,
  BoardMinutesStatus,
  BoardRequestStatus,
  BoardResolutionDueKind,
  BoardResolutionProposerKind,
  BoardResolutionStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { BOARD_ADMIN_ROLE_CODE } from '../access/access.constants';
import {
  MAX_BOARD_ATTACHMENTS,
  MAX_BOARD_MINUTES_MEMBERS,
  MAX_BOARD_MINUTES_REQUESTS,
  MAX_BOARD_RESOLUTION_PROGRESS_REPORTS,
  MAX_BOARD_RESOLUTION_UNITS,
  boardMinutesStatuses,
  boardResolutionStatuses,
} from './board.constants';
import { CreateBoardResolutionProgressDto } from './dto/create-board-resolution-progress.dto';
import { SendBoardMinutesSmsDto } from './dto/send-board-minutes-sms.dto';
import { SendBoardResolutionSmsDto } from './dto/send-board-resolution-sms.dto';
import { UpdateBoardResolutionProgressDto } from './dto/update-board-resolution-progress.dto';
import {
  BoardMinutesMemberDto,
  CreateBoardMinutesDto,
} from './dto/create-board-minutes.dto';
import {
  BoardResolutionSignatoryDto,
  CreateBoardResolutionDto,
} from './dto/create-board-resolution.dto';
import { FindBoardMinutesQueryDto } from './dto/find-board-minutes-query.dto';
import { FindBoardResolutionsQueryDto } from './dto/find-board-resolutions-query.dto';
import { UpdateBoardMinutesDto } from './dto/update-board-minutes.dto';
import { UpdateBoardResolutionDto } from './dto/update-board-resolution.dto';

function memberDisplayName(row: {
  firstName?: string | null;
  lastName?: string | null;
  user?: { fullName?: string | null } | null;
}) {
  const name = `${row.firstName ?? ''} ${row.lastName ?? ''}`.trim();
  return name || row.user?.fullName?.trim() || '';
}

const personSelect = {
  id: true,
  fullName: true,
  username: true,
} satisfies Prisma.UserSelect;

const memberUserSelect = {
  ...personSelect,
  phone: true,
} satisfies Prisma.UserSelect;

const unitSelect = {
  id: true,
  name: true,
  phone: true,
} satisfies Prisma.OrganizationUnitSelect;

const requestSummarySelect = {
  id: true,
  subject: true,
  status: true,
  trackingNo: true,
} satisfies Prisma.BoardRequestSelect;

const minutesInclude = {
  requests: {
    orderBy: { createdAt: 'asc' as const },
    include: { request: { select: requestSummarySelect } },
  },
  createdBy: { select: personSelect },
  members: {
    orderBy: { createdAt: 'asc' as const },
    include: { user: { select: memberUserSelect } },
  },
  attachments: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      image: { select: { id: true, mimeType: true, originalName: true } },
      file: {
        select: { id: true, mimeType: true, originalName: true, byteSize: true, durationMs: true },
      },
    },
  },
  _count: { select: { members: true, resolutions: true, attachments: true, requests: true } },
} satisfies Prisma.BoardMinutesInclude;

const resolutionInclude = {
  executors: {
    orderBy: { createdAt: 'asc' as const },
    include: { unit: { select: unitSelect } },
  },
  proposerUnit: { select: unitSelect },
  signatories: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }],
    select: {
      id: true,
      sourceSignatoryId: true,
      firstName: true,
      lastName: true,
      title: true,
      signatureImageId: true,
      signedAt: true,
      sortOrder: true,
    },
  },
  minutes: {
    select: {
      id: true,
      subject: true,
      heldAt: true,
      minutesNo: true,
      status: true,
      requests: {
        orderBy: { createdAt: 'asc' as const },
        include: { request: { select: requestSummarySelect } },
      },
    },
  },
} satisfies Prisma.BoardMinutesResolutionInclude;

const searchInclude = {
  requests: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      request: {
        select: {
          id: true,
          subject: true,
          status: true,
          trackingNo: true,
          justification: true,
          topicHistory: true,
          description: true,
          orgPositionText: true,
          unit: { select: unitSelect },
        },
      },
    },
  },
  createdBy: { select: personSelect },
  members: {
    include: { user: { select: personSelect } },
  },
  resolutions: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: {
      executors: {
        include: { unit: { select: unitSelect } },
      },
    },
  },
  _count: { select: { resolutions: true } },
} satisfies Prisma.BoardMinutesInclude;

const searchRequestInclude = {
  unit: { select: unitSelect },
  createdBy: { select: personSelect },
  _count: { select: { minutesRequests: true } },
} satisfies Prisma.BoardRequestInclude;

const dossierRequestInclude = {
  unit: { select: unitSelect },
  createdBy: { select: personSelect },
  managementBy: { select: personSelect },
  legalBy: { select: personSelect },
  budgetBy: { select: personSelect },
  secretaryBy: { select: personSelect },
  ceoBy: { select: personSelect },
  rejectedBy: { select: personSelect },
  attachments: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      image: { select: { id: true, mimeType: true, originalName: true } },
      file: { select: { id: true, mimeType: true, originalName: true, byteSize: true } },
    },
  },
  _count: { select: { attachments: true } },
} satisfies Prisma.BoardRequestInclude;

function includesInsensitive(value: string | null | undefined, q: string) {
  return Boolean(value && value.toLowerCase().includes(q.toLowerCase()));
}

function makeSnippet(value: string | null | undefined, q: string, radius = 48) {
  if (!value) return null;
  const index = value.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return null;
  const start = Math.max(0, index - radius);
  const end = Math.min(value.length, index + q.length + radius);
  return `${start > 0 ? '…' : ''}${value.slice(start, end)}${end < value.length ? '…' : ''}`;
}

type Actor = {
  id: string;
  isAdmin: boolean;
  isBoardAdmin: boolean;
};

@Injectable()
export class BoardMinutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async stats(userId: string) {
    await this.requireMinutesActor(userId);
    const [total, linked, resolutionCount] = await Promise.all([
      this.prisma.boardMinutes.count(),
      this.prisma.boardMinutes.count({ where: { requests: { some: {} } } }),
      this.prisma.boardMinutesResolution.count(),
    ]);
    return {
      total,
      linked,
      regular: total - linked,
      resolutionCount,
    };
  }

  async approvedRequests(userId: string) {
    await this.requireMinutesActor(userId);
    const items = await this.prisma.boardRequest.findMany({
      where: { status: BoardRequestStatus.APPROVED },
      select: { id: true, subject: true, requestedAt: true, trackingNo: true },
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
    });
    return items.map((item) => ({
      id: item.id,
      subject: item.subject,
      trackingNo: item.trackingNo,
      requestedAt: toIsoDateOnly(item.requestedAt),
    }));
  }

  async findAll(query: FindBoardMinutesQueryDto, userId: string) {
    await this.requireMinutesActor(userId);
    const heldFrom = query.from;
    const heldTo = query.to;
    const rangeStart = heldFrom && heldTo && heldFrom > heldTo ? heldTo : heldFrom;
    const rangeEnd = heldFrom && heldTo && heldFrom > heldTo ? heldFrom : heldTo;
    const where: Prisma.BoardMinutesWhereInput = {
      ...(rangeStart || rangeEnd
        ? {
            heldAt: {
              ...(rangeStart ? { gte: parseIsoDate(rangeStart) } : {}),
              ...(rangeEnd ? { lte: parseIsoDate(rangeEnd) } : {}),
            },
          }
        : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.requestId
        ? { requests: { some: { requestId: query.requestId } } }
        : query.kind === 'regular'
          ? { requests: { none: {} } }
          : query.kind === 'linked'
            ? { requests: { some: {} } }
            : {}),
      OR: query.q
        ? [
            { minutesNo: containsInsensitive(query.q) },
            { subject: containsInsensitive(query.q) },
            { body: containsInsensitive(query.q) },
            { requests: { some: { request: { subject: containsInsensitive(query.q) } } } },
            { requests: { some: { request: { trackingNo: containsInsensitive(query.q) } } } },
            { createdBy: { fullName: containsInsensitive(query.q) } },
            { resolutions: { some: { title: containsInsensitive(query.q) } } },
            { resolutions: { some: { description: containsInsensitive(query.q) } } },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.BoardMinutesOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        minutesNo: (dir) => ({ minutesYear: dir, minutesSeq: dir }),
        heldAt: (dir) => ({ heldAt: dir }),
        subject: (dir) => ({ subject: dir }),
        status: (dir) => ({ status: dir }),
        request: (dir) => ({ requests: { _count: dir } }),
        memberCount: (dir) => ({ members: { _count: dir } }),
        resolutionCount: (dir) => ({ resolutions: { _count: dir } }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ heldAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.boardMinutes.findMany({
        where,
        orderBy,
        include: minutesInclude,
      });
      return items.map((item) => this.serializeMinutes(item));
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.boardMinutes.findMany({
        where,
        orderBy,
        skip,
        take,
        include: minutesInclude,
      }),
      this.prisma.boardMinutes.count({ where }),
    ]);
    return paginatedResult(
      items.map((item) => this.serializeMinutes(item)),
      total,
      page,
      pageSize,
    );
  }

  async findOne(id: string, userId: string) {
    await this.requireMinutesActor(userId);
    return this.serializeMinutes(await this.loadMinutes(id));
  }

  async smartSearch(query: FindBoardMinutesQueryDto, userId: string) {
    await this.requireMinutesActor(userId);
    const q = query.q?.trim();
    const { page, pageSize, skip, take } = paginationArgs(query);
    if (!q) {
      return {
        ...paginatedResult([], 0, page, pageSize),
        minutesCount: 0,
        requestCount: 0,
        resolutionCount: 0,
      };
    }
    const minutesWhere: Prisma.BoardMinutesWhereInput = { OR: this.smartSearchWhere(q) };
    const requestWhere: Prisma.BoardRequestWhereInput = { OR: this.requestSearchWhere(q) };
    const [minuteRows, requestRows, resolutionCount] = await Promise.all([
      this.prisma.boardMinutes.findMany({
        where: minutesWhere,
        select: { id: true, heldAt: true },
        orderBy: [{ heldAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.boardRequest.findMany({
        where: requestWhere,
        select: { id: true, requestedAt: true },
        orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      }),
      this.prisma.boardMinutesResolution.count({
        where: { OR: this.resolutionTextWhere(q) },
      }),
    ]);
    const mixed = [
      ...minuteRows.map((row) => ({ kind: 'minutes' as const, id: row.id, date: row.heldAt })),
      ...requestRows.map((row) => ({
        kind: 'request' as const,
        id: row.id,
        date: row.requestedAt,
      })),
    ].sort((a, b) => {
      const byDate = b.date.getTime() - a.date.getTime();
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    });
    const pageRows = mixed.slice(skip, skip + take);
    const minutesIds = pageRows.filter((row) => row.kind === 'minutes').map((row) => row.id);
    const requestIds = pageRows.filter((row) => row.kind === 'request').map((row) => row.id);
    const [minutesItems, requestItems] = await Promise.all([
      minutesIds.length
        ? this.prisma.boardMinutes.findMany({
            where: { id: { in: minutesIds } },
            include: searchInclude,
          })
        : Promise.resolve([]),
      requestIds.length
        ? this.prisma.boardRequest.findMany({
            where: { id: { in: requestIds } },
            include: searchRequestInclude,
          })
        : Promise.resolve([]),
    ]);
    const minutesById = new Map(minutesItems.map((item) => [item.id, item]));
    const requestsById = new Map(requestItems.map((item) => [item.id, item]));
    const items: Array<
      | ReturnType<BoardMinutesService['serializeSearchHit']>
      | ReturnType<BoardMinutesService['serializeRequestSearchHit']>
    > = [];
    for (const row of pageRows) {
      if (row.kind === 'minutes') {
        const item = minutesById.get(row.id);
        if (item) items.push(this.serializeSearchHit(item, q));
        continue;
      }
      const item = requestsById.get(row.id);
      if (item) items.push(this.serializeRequestSearchHit(item, q));
    }
    return {
      ...paginatedResult(items, mixed.length, page, pageSize),
      minutesCount: minuteRows.length,
      requestCount: requestRows.length,
      resolutionCount,
    };
  }

  async findDossier(id: string, userId: string) {
    await this.requireMinutesActor(userId);
    const minutes = await this.loadMinutes(id);
    const linkedIds = minutes.requests.map((row) => row.request.id);
    const [requestRows, resolutions] = await Promise.all([
      linkedIds.length
        ? this.prisma.boardRequest.findMany({
            where: { id: { in: linkedIds } },
            include: dossierRequestInclude,
          })
        : Promise.resolve([]),
      this.prisma.boardMinutesResolution.findMany({
        where: { minutesId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: resolutionInclude,
      }),
    ]);
    const requestsById = new Map(requestRows.map((row) => [row.id, row]));
    const requests = linkedIds
      .map((requestId) => requestsById.get(requestId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => this.serializeDossierRequest(item));
    return {
      minutes: this.serializeMinutes(minutes),
      request: requests[0] ?? null,
      requests,
      resolutions: resolutions.map((item) => this.serializeResolution(item)),
    };
  }

  async create(dto: CreateBoardMinutesDto, userId: string) {
    const actor = await this.requireMinutesActor(userId);
    const requestIds = await this.resolveRequestIds(dto.requestIds);
    const members = await this.normalizeMembers(dto.members);
    const attachments = await this.buildAttachments(dto.imageIds, dto.audioIds);
    const heldAt = parseIsoDate(dto.heldAt);
    const created = await this.createWithNumber({
      heldAt,
      subject: dto.subject,
      body: dto.body ?? null,
      status: this.resolveStatus(dto.status),
      createdById: actor.id,
      requestIds,
      members,
      attachments,
    });
    return this.serializeMinutes(created);
  }

  async update(id: string, dto: UpdateBoardMinutesDto, userId: string) {
    await this.requireMinutesActor(userId);
    const current = await this.loadMinutes(id);
    const requestIds =
      dto.requestIds !== undefined
        ? await this.resolveRequestIds(
            dto.requestIds,
            current.requests.map((row) => row.request.id),
          )
        : undefined;
    const members =
      dto.members !== undefined ? await this.normalizeMembers(dto.members) : undefined;
    const attachments =
      dto.imageIds !== undefined || dto.audioIds !== undefined
        ? await this.buildAttachments(dto.imageIds ?? [], dto.audioIds ?? [])
        : undefined;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (members) {
        await tx.boardMinutesMember.deleteMany({ where: { minutesId: id } });
      }
      if (attachments) {
        await tx.boardMinutesAttachment.deleteMany({ where: { minutesId: id } });
      }
      if (requestIds) {
        await tx.boardMinutesRequest.deleteMany({ where: { minutesId: id } });
      }
      const addedRequestIds = requestIds
        ? requestIds.filter(
            (requestId) => !current.requests.some((row) => row.request.id === requestId),
          )
        : [];
      const addedResolutions = await this.resolutionsFromRequestIds(tx, addedRequestIds);
      const defaultSignatories = addedResolutions.length
        ? await this.defaultResolutionSignatories(tx)
        : [];
      for (const row of addedResolutions) {
        await tx.boardMinutesResolution.create({
          data: { minutesId: id, ...this.resolutionCreateData(row, defaultSignatories) },
        });
      }
      return tx.boardMinutes.update({
        where: { id },
        data: {
          heldAt: dto.heldAt !== undefined ? parseIsoDate(dto.heldAt) : undefined,
          subject: dto.subject,
          body: dto.body === undefined ? undefined : dto.body,
          status: dto.status !== undefined ? this.resolveStatus(dto.status) : undefined,
          members: members?.length ? { create: members } : undefined,
          attachments: attachments?.length ? { create: attachments } : undefined,
          requests: requestIds?.length
            ? { create: requestIds.map((requestId) => ({ requestId })) }
            : undefined,
        },
        include: minutesInclude,
      });
    });
    return this.serializeMinutes(updated);
  }

  async remove(id: string, userId: string) {
    await this.requireMinutesActor(userId);
    await this.loadMinutes(id);
    await this.prisma.boardMinutes.delete({ where: { id } });
  }

  async sendSms(id: string, dto: SendBoardMinutesSmsDto, userId: string) {
    await this.requireMinutesActor(userId);
    const item = await this.prisma.boardMinutes.findUnique({
      where: { id },
      include: {
        members: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: memberUserSelect } },
        },
      },
    });
    if (!item) throw new NotFoundException('صورت‌جلسه یافت نشد');
    if (!item.members.length) {
      throw new BadRequestException('این صورت‌جلسه عضوی ندارد');
    }

    let selectedMembers = item.members;
    if (dto.memberIds) {
      const allowed = new Set(item.members.map((row) => row.id));
      if (dto.memberIds.some((memberId) => !allowed.has(memberId))) {
        throw new BadRequestException('عضو انتخاب‌شده در این صورت‌جلسه نیست');
      }
      selectedMembers = item.members.filter((row) => dto.memberIds!.includes(row.id));
      if (!selectedMembers.length) {
        throw new BadRequestException('هیچ عضوی انتخاب نشده است');
      }
    }

    const unique = new Map<string, { fullName: string; phone: string }>();
    for (const row of selectedMembers) {
      if (unique.has(row.id)) continue;
      unique.set(row.id, {
        fullName: memberDisplayName(row),
        phone: row.user?.phone?.trim() ?? '',
      });
    }
    const recipients = [...unique.values()];
    const withPhone = recipients.filter((row) => row.phone);
    const withoutPhone = recipients.filter((row) => !row.phone);
    if (!withPhone.length) {
      throw new BadRequestException('هیچ‌یک از اعضا شماره همراه ندارند');
    }

    let providerSkipped = false;
    let providerMessage: string | undefined;
    for (const row of withPhone) {
      const result = await this.sms.send({ phone: row.phone, body: dto.body });
      if (result.skipped) {
        providerSkipped = true;
        providerMessage = result.message;
      }
    }

    return {
      recipientCount: withPhone.length,
      skippedNoPhoneCount: withoutPhone.length,
      skippedNames: withoutPhone.map((row) => row.fullName),
      providerSkipped,
      providerMessage,
    };
  }

  async sendResolutionSms(
    minutesId: string,
    resolutionId: string,
    dto: SendBoardResolutionSmsDto,
    userId: string,
  ) {
    await this.requireMinutesActor(userId);
    const item = await this.loadResolution(minutesId, resolutionId);
    if (!item.executors.length) {
      throw new BadRequestException('این مصوبه مجری ندارد');
    }

    const allowed = new Set(item.executors.map((row) => row.unitId));
    let selected = item.executors;
    if (dto.unitIds) {
      if (dto.unitIds.some((unitId) => !allowed.has(unitId))) {
        throw new BadRequestException('مجری انتخاب‌شده در این مصوبه نیست');
      }
      selected = item.executors.filter((row) => dto.unitIds!.includes(row.unitId));
      if (!selected.length) {
        throw new BadRequestException('هیچ مجری انتخاب نشده است');
      }
    }

    const overrides = new Map<string, string>();
    for (const row of dto.phones ?? []) {
      if (!allowed.has(row.unitId)) {
        throw new BadRequestException('مجری انتخاب‌شده در این مصوبه نیست');
      }
      overrides.set(row.unitId, row.phone);
    }

    const unique = new Map<string, { name: string; phone: string }>();
    for (const row of selected) {
      if (unique.has(row.unitId)) continue;
      unique.set(row.unitId, {
        name: row.unit.name,
        phone: row.unit.phone?.trim() || overrides.get(row.unitId) || '',
      });
    }
    const recipients = [...unique.values()];
    const withPhone = recipients.filter((row) => row.phone);
    const withoutPhone = recipients.filter((row) => !row.phone);
    if (!withPhone.length) {
      throw new BadRequestException('هیچ‌یک از مجریان شماره همراه ندارند');
    }

    let providerSkipped = false;
    let providerMessage: string | undefined;
    for (const row of withPhone) {
      const result = await this.sms.send({ phone: row.phone, body: dto.body });
      if (result.skipped) {
        providerSkipped = true;
        providerMessage = result.message;
      }
    }

    return {
      recipientCount: withPhone.length,
      skippedNoPhoneCount: withoutPhone.length,
      skippedNames: withoutPhone.map((row) => row.name),
      providerSkipped,
      providerMessage,
    };
  }

  async findAllResolutions(query: FindBoardResolutionsQueryDto, userId: string) {
    await this.requireMinutesActor(userId);
    return this.listResolutions({ OR: this.resolutionSearch(query.q) }, query, wantsPagination(query)
      ? [{ createdAt: 'desc' }, { id: 'asc' }]
      : [{ dueDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]);
  }

  async findResolutions(
    minutesId: string,
    query: FindBoardResolutionsQueryDto,
    userId: string,
  ) {
    await this.requireMinutesActor(userId);
    await this.loadMinutes(minutesId);
    return this.listResolutions(
      { minutesId, OR: this.resolutionSearch(query.q) },
      query,
    );
  }

  async findResolution(minutesId: string, id: string, userId: string) {
    await this.requireMinutesActor(userId);
    return this.serializeResolution(await this.loadResolution(minutesId, id));
  }

  async findProgressReports(minutesId: string, resolutionId: string, userId: string) {
    await this.requireMinutesActor(userId);
    await this.loadResolution(minutesId, resolutionId);
    const items = await this.prisma.boardResolutionProgressReport.findMany({
      where: { resolutionId },
      orderBy: [{ reportedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    return {
      items: items.map((row) => this.serializeProgressReport(row)),
      totalProgress: items.reduce((sum, row) => sum + row.progressAmount, 0),
    };
  }

  async createProgressReport(
    minutesId: string,
    resolutionId: string,
    dto: CreateBoardResolutionProgressDto,
    userId: string,
  ) {
    await this.requireMinutesActor(userId);
    await this.loadResolution(minutesId, resolutionId);
    const count = await this.prisma.boardResolutionProgressReport.count({
      where: { resolutionId },
    });
    if (count >= MAX_BOARD_RESOLUTION_PROGRESS_REPORTS) {
      throw new BadRequestException('تعداد گزارش‌های پیشرفت این مصوبه به سقف رسیده است');
    }
    const created = await this.prisma.boardResolutionProgressReport.create({
      data: {
        resolutionId,
        reportedAt: parseIsoDate(dto.reportedAt),
        title: dto.title,
        category: dto.category ?? null,
        body: dto.body ?? null,
        progressAmount: dto.progressAmount,
      },
    });
    return this.serializeProgressReport(created);
  }

  async updateProgressReport(
    minutesId: string,
    resolutionId: string,
    reportId: string,
    dto: UpdateBoardResolutionProgressDto,
    userId: string,
  ) {
    await this.requireMinutesActor(userId);
    await this.loadProgressReport(minutesId, resolutionId, reportId);
    const updated = await this.prisma.boardResolutionProgressReport.update({
      where: { id: reportId },
      data: {
        reportedAt: dto.reportedAt ? parseIsoDate(dto.reportedAt) : undefined,
        title: dto.title,
        category: dto.category === undefined ? undefined : dto.category,
        body: dto.body === undefined ? undefined : dto.body,
        progressAmount: dto.progressAmount,
      },
    });
    return this.serializeProgressReport(updated);
  }

  async removeProgressReport(
    minutesId: string,
    resolutionId: string,
    reportId: string,
    userId: string,
  ) {
    await this.requireMinutesActor(userId);
    await this.loadProgressReport(minutesId, resolutionId, reportId);
    await this.prisma.boardResolutionProgressReport.delete({ where: { id: reportId } });
  }

  async createResolution(minutesId: string, dto: CreateBoardResolutionDto, userId: string) {
    await this.requireMinutesActor(userId);
    await this.loadMinutes(minutesId);
    const due = this.resolveResolutionDue(dto);
    const proposer = this.resolveResolutionProposer(dto);
    const unitIds = await this.normalizeResolutionUnitIds(dto.unitIds);
    if (proposer.proposerUnitId) await this.assertUnitExists(proposer.proposerUnitId);
    const signatories =
      dto.signatories === undefined
        ? await this.defaultResolutionSignatories()
        : await this.normalizeResolutionSignatories(dto.signatories);
    const created = await this.prisma.boardMinutesResolution.create({
      data: {
        minutesId,
        title: dto.title,
        description: dto.description ?? null,
        status: this.resolveResolutionStatus(dto.status),
        executors: unitIds.length
          ? { create: unitIds.map((unitId) => ({ unitId })) }
          : undefined,
        dueKind: due.dueKind,
        dueDate: due.dueDate,
        hasTopicHistory: dto.hasTopicHistory ?? false,
        legalBasis: dto.legalBasis ?? null,
        proposerKind: proposer.proposerKind,
        proposerText: proposer.proposerText,
        proposerUnitId: proposer.proposerUnitId,
        notes: dto.notes ?? null,
        signatories: signatories?.length ? { create: signatories } : undefined,
      },
      include: resolutionInclude,
    });
    return this.serializeResolution(created);
  }

  async updateResolution(
    minutesId: string,
    id: string,
    dto: UpdateBoardResolutionDto,
    userId: string,
  ) {
    await this.requireMinutesActor(userId);
    const current = await this.loadResolution(minutesId, id);
    const due = this.resolveResolutionDue(dto, current);
    const proposer = this.resolveResolutionProposer(dto, current);
    const unitIds =
      dto.unitIds !== undefined ? await this.normalizeResolutionUnitIds(dto.unitIds) : undefined;
    if (proposer.proposerUnitId) await this.assertUnitExists(proposer.proposerUnitId);
    const signatories = await this.normalizeResolutionSignatories(dto.signatories);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (signatories) {
        await tx.boardResolutionSignatory.deleteMany({ where: { resolutionId: id } });
      }
      if (unitIds) {
        await tx.boardMinutesResolutionUnit.deleteMany({ where: { resolutionId: id } });
      }
      return tx.boardMinutesResolution.update({
        where: { id },
        data: {
          title: dto.title,
          description: dto.description === undefined ? undefined : dto.description,
          status: dto.status !== undefined ? this.resolveResolutionStatus(dto.status) : undefined,
          executors: unitIds?.length
            ? { create: unitIds.map((unitId) => ({ unitId })) }
            : undefined,
          dueKind: due.dueKind,
          dueDate: due.dueDate,
          hasTopicHistory: dto.hasTopicHistory,
          legalBasis: dto.legalBasis === undefined ? undefined : dto.legalBasis,
          proposerKind: proposer.proposerKind,
          proposerText: proposer.proposerText,
          proposerUnitId: proposer.proposerUnitId,
          notes: dto.notes === undefined ? undefined : dto.notes,
          signatories: signatories?.length ? { create: signatories } : undefined,
        },
        include: resolutionInclude,
      });
    });
    return this.serializeResolution(updated);
  }

  async removeResolution(minutesId: string, id: string, userId: string) {
    await this.requireMinutesActor(userId);
    await this.loadResolution(minutesId, id);
    await this.prisma.boardMinutesResolution.delete({ where: { id } });
  }

  async assertMinutesAccess(userId: string) {
    await this.requireMinutesActor(userId);
  }

  private async requireMinutesActor(userId: string): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userRoles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!user) throw new UnauthorizedException();
    const actor: Actor = {
      id: user.id,
      isAdmin: user.userRoles.some((row) => row.role.code === 'ADMIN'),
      isBoardAdmin: user.userRoles.some((row) => row.role.code === BOARD_ADMIN_ROLE_CODE),
    };
    if (!actor.isAdmin && !actor.isBoardAdmin) {
      throw new ForbiddenException('فقط مدیر ماژول هیئت مدیره به صورت‌جلسه‌ها دسترسی دارد');
    }
    return actor;
  }

  private async loadMinutes(id: string) {
    const item = await this.prisma.boardMinutes.findUnique({
      where: { id },
      include: minutesInclude,
    });
    if (!item) throw new NotFoundException('صورت‌جلسه یافت نشد');
    return item;
  }

  private async loadResolution(minutesId: string, id: string) {
    const item = await this.prisma.boardMinutesResolution.findFirst({
      where: { id, minutesId },
      include: resolutionInclude,
    });
    if (!item) throw new NotFoundException('مصوبه یافت نشد');
    return item;
  }

  private async loadProgressReport(minutesId: string, resolutionId: string, reportId: string) {
    await this.loadResolution(minutesId, resolutionId);
    const item = await this.prisma.boardResolutionProgressReport.findFirst({
      where: { id: reportId, resolutionId },
    });
    if (!item) throw new NotFoundException('گزارش پیشرفت یافت نشد');
    return item;
  }

  private serializeProgressReport(row: {
    id: string;
    resolutionId: string;
    reportedAt: Date;
    title: string;
    category: string | null;
    body: string | null;
    progressAmount: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      resolutionId: row.resolutionId,
      reportedAt: toIsoDateOnly(row.reportedAt),
      title: row.title,
      category: row.category,
      body: row.body,
      progressAmount: row.progressAmount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private resolveStatus(status?: string | null) {
    if (status && boardMinutesStatuses.includes(status as (typeof boardMinutesStatuses)[number])) {
      return status as BoardMinutesStatus;
    }
    return BoardMinutesStatus.NOT_HELD;
  }

  private resolveResolutionStatus(status?: string | null) {
    if (
      status &&
      boardResolutionStatuses.includes(status as (typeof boardResolutionStatuses)[number])
    ) {
      return status as BoardResolutionStatus;
    }
    return BoardResolutionStatus.NOT_NOTIFIED;
  }

  private jalaliYearFromIso(iso: string) {
    const [year, month, day] = iso.split('-').map(Number);
    if (!year || !month || !day) {
      throw new BadRequestException('تاریخ جلسه معتبر نیست');
    }
    return gregorianToJalali(year, month, day).year;
  }

  private async createWithNumber(data: {
    heldAt: Date;
    subject: string;
    body: string | null;
    status: BoardMinutesStatus;
    createdById: string;
    requestIds: string[];
    members: {
      kind: BoardMinutesMemberKind;
      userId: string | null;
      signatoryId: string | null;
      firstName: string;
      lastName: string;
      title: string | null;
      attendance: BoardMinutesAttendance;
    }[];
    attachments: {
      kind: BoardMinutesAttachmentKind;
      imageId?: string;
      fileId?: string;
      sortOrder: number;
    }[];
  }) {
    const heldIso = toIsoDateOnly(data.heldAt);
    if (!heldIso) throw new BadRequestException('تاریخ جلسه معتبر نیست');
    const minutesYear = this.jalaliYearFromIso(heldIso);
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const last = await tx.boardMinutes.findFirst({
            where: { minutesYear },
            orderBy: { minutesSeq: 'desc' },
            select: { minutesSeq: true },
          });
          const minutesSeq = (last?.minutesSeq ?? 0) + 1;
          const resolutions = await this.resolutionsFromRequestIds(tx, data.requestIds);
          const defaultSignatories = resolutions.length
            ? await this.defaultResolutionSignatories(tx)
            : [];
          return tx.boardMinutes.create({
            data: {
              minutesYear,
              minutesSeq,
              minutesNo: `${minutesYear}/${minutesSeq}`,
              heldAt: data.heldAt,
              subject: data.subject,
              body: data.body,
              status: data.status,
              createdById: data.createdById,
              members: data.members.length ? { create: data.members } : undefined,
              attachments: data.attachments.length ? { create: data.attachments } : undefined,
              requests: data.requestIds.length
                ? { create: data.requestIds.map((requestId) => ({ requestId })) }
                : undefined,
              resolutions: resolutions.length
                ? {
                    create: resolutions.map((row) =>
                      this.resolutionCreateData(row, defaultSignatories),
                    ),
                  }
                : undefined,
            },
            include: minutesInclude,
          });
        });
      } catch (error) {
        lastError = error;
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002' &&
          attempt < 4
        ) {
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  private async resolutionsFromRequestIds(
    tx: Prisma.TransactionClient,
    requestIds: string[],
  ) {
    if (!requestIds.length) return [];
    const rows = await tx.boardRequest.findMany({
      where: { id: { in: requestIds } },
      select: {
        id: true,
        subject: true,
        description: true,
        justification: true,
        unitId: true,
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return requestIds
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map((row) => this.resolutionDataFromRequest(row));
  }

  private resolutionDataFromRequest(request: {
    subject: string;
    description: string | null;
    justification: string | null;
    unitId: string;
  }) {
    const title = request.subject.trim().slice(0, 240) || 'مصوبه';
    const description = (
      request.description?.trim() ||
      request.justification?.trim() ||
      request.subject.trim()
    ).slice(0, 8000);
    return {
      title,
      description,
      unitIds: request.unitId ? [request.unitId] : [],
      dueKind: BoardResolutionDueKind.ASAP,
      dueDate: null as Date | null,
    };
  }

  private resolutionCreateData(
    row: {
      title: string;
      description: string;
      unitIds: string[];
      dueKind: BoardResolutionDueKind;
      dueDate: Date | null;
    },
    signatories: Prisma.BoardResolutionSignatoryCreateWithoutResolutionInput[],
  ) {
    return {
      title: row.title,
      description: row.description,
      dueKind: row.dueKind,
      dueDate: row.dueDate,
      executors: row.unitIds.length
        ? { create: row.unitIds.map((unitId) => ({ unitId })) }
        : undefined,
      signatories: signatories.length ? { create: signatories } : undefined,
    };
  }

  private async defaultResolutionSignatories(
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Prisma.BoardResolutionSignatoryCreateWithoutResolutionInput[]> {
    const rows = await db.boardSignatory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        title: true,
        signatureImageId: true,
      },
    });
    return rows.map((row, index) => ({
      sourceSignatoryId: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      title: row.title,
      signatureImageId: row.signatureImageId,
      signedAt: null,
      sortOrder: index,
    }));
  }

  private async normalizeResolutionUnitIds(unitIds?: string[]) {
    const unique = [...new Set(unitIds ?? [])];
    if (unique.length > MAX_BOARD_RESOLUTION_UNITS) {
      throw new BadRequestException('تعداد مجریان بیش از حد مجاز است');
    }
    if (!unique.length) return [];
    const count = await this.prisma.organizationUnit.count({
      where: { id: { in: unique } },
    });
    if (count !== unique.length) {
      throw new BadRequestException('یکی از واحدهای مجری معتبر نیست');
    }
    return unique;
  }

  private async resolveRequestIds(requestIds?: string[], existingIds: string[] = []) {
    const unique = [...new Set(requestIds ?? [])];
    if (unique.length > MAX_BOARD_MINUTES_REQUESTS) {
      throw new BadRequestException('تعداد درخواست‌های صورت‌جلسه بیش از حد مجاز است');
    }
    if (!unique.length) return [];
    const requests = await this.prisma.boardRequest.findMany({
      where: { id: { in: unique } },
      select: { id: true, status: true },
    });
    if (requests.length !== unique.length) {
      throw new BadRequestException('درخواست طرح موضوع یافت نشد');
    }
    const existing = new Set(existingIds);
    if (
      requests.some(
        (item) => item.status !== BoardRequestStatus.APPROVED && !existing.has(item.id),
      )
    ) {
      throw new BadRequestException('فقط پس از تأیید نهایی می‌توان درخواست را به صورت‌جلسه افزود');
    }
    return unique;
  }

  private async normalizeMembers(members?: BoardMinutesMemberDto[]) {
    const list = members ?? [];
    if (list.length > MAX_BOARD_MINUTES_MEMBERS) {
      throw new BadRequestException('تعداد اعضا بیش از حد مجاز است');
    }
    const userIds = [
      ...new Set(list.map((row) => row.userId).filter((id): id is string => Boolean(id))),
    ];
    const signatoryIds = [
      ...new Set(
        list.map((row) => row.signatoryId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const [users, signatories] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      signatoryIds.length
        ? this.prisma.boardSignatory.findMany({
            where: { id: { in: signatoryIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              title: true,
              userId: true,
            },
          })
        : Promise.resolve([]),
    ]);
    if (users.length !== userIds.length) {
      throw new BadRequestException('یکی از اعضای انتخاب‌شده معتبر نیست');
    }
    if (signatories.length !== signatoryIds.length) {
      throw new BadRequestException('دارنده حق امضای انتخاب‌شده معتبر نیست');
    }
    const userMap = new Map(users.map((row) => [row.id, row]));
    const signatoryMap = new Map(signatories.map((row) => [row.id, row]));
    const seenUsers = new Set<string>();
    const seenSignatories = new Set<string>();
    return list.map((row) => {
      const attendance =
        row.attendance === 'ABSENT'
          ? BoardMinutesAttendance.ABSENT
          : BoardMinutesAttendance.PRESENT;
      if (row.signatoryId) {
        const source = signatoryMap.get(row.signatoryId);
        if (!source) {
          throw new BadRequestException('دارنده حق امضای انتخاب‌شده معتبر نیست');
        }
        if (seenSignatories.has(source.id)) {
          throw new BadRequestException('یک دارنده حق امضا بیش از یک بار انتخاب شده است');
        }
        seenSignatories.add(source.id);
        const linkedUserId = source.userId ?? row.userId ?? null;
        if (linkedUserId) {
          if (seenUsers.has(linkedUserId)) {
            throw new BadRequestException('یک نفر بیش از یک بار به جلسه اضافه شده است');
          }
          seenUsers.add(linkedUserId);
        }
        return {
          kind: BoardMinutesMemberKind.SIGNATORY,
          userId: linkedUserId,
          signatoryId: source.id,
          firstName: row.firstName?.trim() || source.firstName,
          lastName: row.lastName?.trim() || source.lastName,
          title: row.title?.trim() || source.title,
          attendance,
        };
      }
      if (row.userId) {
        const user = userMap.get(row.userId);
        if (!user) {
          throw new BadRequestException('یکی از اعضای انتخاب‌شده معتبر نیست');
        }
        if (seenUsers.has(user.id)) {
          throw new BadRequestException('یک نفر بیش از یک بار به جلسه اضافه شده است');
        }
        seenUsers.add(user.id);
        return {
          kind: BoardMinutesMemberKind.USER,
          userId: user.id,
          signatoryId: null,
          firstName: row.firstName?.trim() || user.firstName,
          lastName: row.lastName?.trim() || user.lastName,
          title: row.title?.trim() || null,
          attendance,
        };
      }
      const firstName = row.firstName?.trim() ?? '';
      const lastName = row.lastName?.trim() ?? '';
      if (!firstName || !lastName) {
        throw new BadRequestException('نام و نام خانوادگی مهمان را وارد کنید');
      }
      return {
        kind: BoardMinutesMemberKind.GUEST,
        userId: null,
        signatoryId: null,
        firstName,
        lastName,
        title: row.title?.trim() || null,
        attendance,
      };
    });
  }

  private async buildAttachments(imageIds?: string[], audioIds?: string[]) {
    const images = [...new Set(imageIds ?? [])];
    const audios = [...new Set(audioIds ?? [])];
    if (images.length + audios.length > MAX_BOARD_ATTACHMENTS) {
      throw new BadRequestException('تعداد پیوست‌ها بیش از حد مجاز است');
    }
    if (images.length) {
      const count = await this.prisma.storedImage.count({
        where: { id: { in: images } },
      });
      if (count !== images.length) {
        throw new BadRequestException('یکی از تصاویر پیوست معتبر نیست');
      }
    }
    if (audios.length) {
      const count = await this.prisma.storedFile.count({
        where: { id: { in: audios } },
      });
      if (count !== audios.length) {
        throw new BadRequestException('یکی از فایل‌های صوتی معتبر نیست');
      }
    }
    return [
      ...images.map((imageId, index) => ({
        kind: BoardMinutesAttachmentKind.IMAGE,
        imageId,
        sortOrder: index,
      })),
      ...audios.map((fileId, index) => ({
        kind: BoardMinutesAttachmentKind.AUDIO,
        fileId,
        sortOrder: images.length + index,
      })),
    ];
  }

  private async assertUnitExists(id: string) {
    const unit = await this.prisma.organizationUnit.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!unit) throw new BadRequestException('واحد سازمانی یافت نشد');
  }

  private resolutionTextWhere(q: string): Prisma.BoardMinutesResolutionWhereInput['OR'] {
    const text = containsInsensitive(q);
    return [
      { title: text },
      { description: text },
      { notes: text },
      { legalBasis: text },
      { proposerText: text },
      { executors: { some: { unit: { name: text } } } },
      { proposerUnit: { name: text } },
    ];
  }

  private requestSearchWhere(q: string): Prisma.BoardRequestWhereInput['OR'] {
    const text = containsInsensitive(q);
    return [
      { subject: text },
      { orgPositionText: text },
      { justification: text },
      { topicHistory: text },
      { description: text },
      { unit: { name: text } },
      { trackingNo: text },
      { createdBy: { fullName: text } },
      { managementComment: text },
      { legalComment: text },
      { budgetComment: text },
      { secretaryComment: text },
      { ceoComment: text },
      { rejectedComment: text },
    ];
  }

  private smartSearchWhere(q: string): Prisma.BoardMinutesWhereInput['OR'] {
    const text = containsInsensitive(q);
    return [
      { subject: text },
      { body: text },
      { minutesNo: text },
      { createdBy: { fullName: text } },
      { members: { some: { user: { fullName: text } } } },
      { members: { some: { firstName: text } } },
      { members: { some: { lastName: text } } },
      { members: { some: { title: text } } },
      { requests: { some: { request: { subject: text } } } },
      { requests: { some: { request: { trackingNo: text } } } },
      { requests: { some: { request: { justification: text } } } },
      { requests: { some: { request: { topicHistory: text } } } },
      { requests: { some: { request: { description: text } } } },
      { requests: { some: { request: { orgPositionText: text } } } },
      { requests: { some: { request: { unit: { name: text } } } } },
      { resolutions: { some: { title: text } } },
      { resolutions: { some: { description: text } } },
      { resolutions: { some: { notes: text } } },
      { resolutions: { some: { executors: { some: { unit: { name: text } } } } } },
    ];
  }

  private serializeSearchHit(
    item: Prisma.BoardMinutesGetPayload<{ include: typeof searchInclude }>,
    q: string,
  ) {
    const matchedResolutions = item.resolutions.filter(
      (row) =>
        includesInsensitive(row.title, q) ||
        includesInsensitive(row.description, q) ||
        includesInsensitive(row.notes, q) ||
        row.executors.some((link) => includesInsensitive(link.unit.name, q)),
    );
    const linkedRequests = item.requests.map((row) => row.request);
    const matchedRequest = linkedRequests.find(
      (request) =>
        includesInsensitive(request.subject, q) ||
        includesInsensitive(request.trackingNo, q) ||
        includesInsensitive(request.justification, q) ||
        includesInsensitive(request.topicHistory, q) ||
        includesInsensitive(request.description, q) ||
        includesInsensitive(request.orgPositionText, q) ||
        includesInsensitive(request.unit.name, q),
    );
    const matchIn = [
      ...(includesInsensitive(item.subject, q) ||
      includesInsensitive(item.body, q) ||
      includesInsensitive(item.minutesNo, q) ||
      includesInsensitive(item.createdBy.fullName, q) ||
      item.members.some(
        (row) =>
          includesInsensitive(memberDisplayName(row), q) ||
          includesInsensitive(row.user?.fullName, q),
      )
        ? (['minutes'] as const)
        : []),
      ...(matchedRequest ? (['request'] as const) : []),
      ...(matchedResolutions.length ? (['resolution'] as const) : []),
    ];
    const snippet =
      makeSnippet(item.subject, q) ||
      makeSnippet(item.body, q) ||
      makeSnippet(item.minutesNo, q) ||
      makeSnippet(matchedRequest?.subject, q) ||
      makeSnippet(matchedRequest?.justification, q) ||
      makeSnippet(matchedRequest?.topicHistory, q) ||
      makeSnippet(matchedRequest?.description, q) ||
      makeSnippet(matchedResolutions[0]?.title, q) ||
      makeSnippet(matchedResolutions[0]?.description, q) ||
      makeSnippet(matchedResolutions[0]?.notes, q) ||
      null;
    const requests = linkedRequests.map((request) => ({
      id: request.id,
      subject: request.subject,
      status: request.status,
      trackingNo: request.trackingNo,
    }));
    return {
      kind: 'minutes' as const,
      id: item.id,
      minutesNo: item.minutesNo,
      status: item.status,
      subject: item.subject,
      heldAt: toIsoDateOnly(item.heldAt),
      body: item.body,
      request: requests[0] ?? null,
      requests,
      resolutionCount: item._count.resolutions,
      matchIn,
      snippet,
      matchedResolutions: matchedResolutions.slice(0, 5).map((row) => ({
        id: row.id,
        title: row.title,
      })),
    };
  }

  private serializeRequestSearchHit(
    item: Prisma.BoardRequestGetPayload<{ include: typeof searchRequestInclude }>,
    q: string,
  ) {
    const snippet =
      makeSnippet(item.subject, q) ||
      makeSnippet(item.justification, q) ||
      makeSnippet(item.topicHistory, q) ||
      makeSnippet(item.description, q) ||
      makeSnippet(item.orgPositionText, q) ||
      makeSnippet(item.unit.name, q) ||
      makeSnippet(item.createdBy.fullName, q) ||
      makeSnippet(item.managementComment, q) ||
      makeSnippet(item.legalComment, q) ||
      makeSnippet(item.budgetComment, q) ||
      makeSnippet(item.secretaryComment, q) ||
      makeSnippet(item.ceoComment, q) ||
      makeSnippet(item.rejectedComment, q) ||
      null;
    return {
      kind: 'request' as const,
      id: item.id,
      subject: item.subject,
      requestedAt: toIsoDateOnly(item.requestedAt),
      status: item.status,
      unit: item.unit,
      snippet,
      matchIn: ['request'] as const,
      minutesCount: item._count.minutesRequests,
    };
  }

  private serializeDossierRequest(
    item: Prisma.BoardRequestGetPayload<{ include: typeof dossierRequestInclude }>,
  ) {
    return {
      ...item,
      requestedAt: toIsoDateOnly(item.requestedAt),
      managementAt: item.managementAt?.toISOString() ?? null,
      legalReferredAt: item.legalReferredAt?.toISOString() ?? null,
      legalAt: item.legalAt?.toISOString() ?? null,
      budgetReferredAt: item.budgetReferredAt?.toISOString() ?? null,
      budgetAt: item.budgetAt?.toISOString() ?? null,
      secretaryReferredAt: item.secretaryReferredAt?.toISOString() ?? null,
      secretaryAt: item.secretaryAt?.toISOString() ?? null,
      ceoReferredAt: item.ceoReferredAt?.toISOString() ?? null,
      ceoAt: item.ceoAt?.toISOString() ?? null,
      rejectedAt: item.rejectedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      attachments: item.attachments.map((row) => ({
        id: row.id,
        stage: row.stage,
        kind: row.kind,
        imageId: row.imageId,
        fileId: row.fileId,
        originalName:
          row.originalName || row.image?.originalName || row.file?.originalName || null,
        mimeType: row.image?.mimeType || row.file?.mimeType || null,
        byteSize: row.file?.byteSize ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private serializeMinutes(
    item: Prisma.BoardMinutesGetPayload<{ include: typeof minutesInclude }>,
  ) {
    const requests = item.requests.map((row) => row.request);
    return {
      id: item.id,
      minutesNo: item.minutesNo,
      minutesYear: item.minutesYear,
      minutesSeq: item.minutesSeq,
      status: item.status,
      requestId: requests[0]?.id ?? null,
      request: requests[0] ?? null,
      requestIds: requests.map((row) => row.id),
      requests,
      heldAt: toIsoDateOnly(item.heldAt),
      subject: item.subject,
      body: item.body,
      createdById: item.createdById,
      createdBy: item.createdBy,
      members: item.members.map((row) => ({
        id: row.id,
        kind: row.kind,
        userId: row.userId,
        signatoryId: row.signatoryId,
        firstName: row.firstName,
        lastName: row.lastName,
        title: row.title,
        attendance: row.attendance,
        user: row.user,
      })),
      attachments: item.attachments.map((row) => ({
        id: row.id,
        kind: row.kind,
        imageId: row.imageId,
        fileId: row.fileId,
        originalName:
          row.originalName || row.image?.originalName || row.file?.originalName || null,
        mimeType: row.image?.mimeType || row.file?.mimeType || null,
        byteSize: row.file?.byteSize ?? null,
        durationMs: row.file?.durationMs ?? null,
      })),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      _count: item._count,
    };
  }

  private resolutionSearch(q?: string): Prisma.BoardMinutesResolutionWhereInput['OR'] {
    if (!q) return undefined;
    return [
      { title: containsInsensitive(q) },
      { description: containsInsensitive(q) },
      { notes: containsInsensitive(q) },
      { legalBasis: containsInsensitive(q) },
      { proposerText: containsInsensitive(q) },
      { executors: { some: { unit: { name: containsInsensitive(q) } } } },
      { proposerUnit: { name: containsInsensitive(q) } },
      { signatories: { some: { firstName: containsInsensitive(q) } } },
      { signatories: { some: { lastName: containsInsensitive(q) } } },
      { signatories: { some: { title: containsInsensitive(q) } } },
      { minutes: { subject: containsInsensitive(q) } },
      { minutes: { body: containsInsensitive(q) } },
      { minutes: { minutesNo: containsInsensitive(q) } },
      { minutes: { requests: { some: { request: { subject: containsInsensitive(q) } } } } },
    ];
  }

  private resolutionOrderBy(
    query: FindBoardResolutionsQueryDto,
    fallback: Prisma.BoardMinutesResolutionOrderByWithRelationInput[] = [
      { createdAt: 'desc' },
      { id: 'asc' },
    ],
  ) {
    return resolveSortOrder<Prisma.BoardMinutesResolutionOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        unit: (dir) => ({ executors: { _count: dir } }),
        status: (dir) => ({ status: dir }),
        dueDate: (dir) => ({ dueDate: dir }),
        minutes: (dir) => ({ minutes: { subject: dir } }),
        request: (dir) => ({ minutes: { requests: { _count: dir } } }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      fallback,
    );
  }

  private async listResolutions(
    where: Prisma.BoardMinutesResolutionWhereInput,
    query: FindBoardResolutionsQueryDto,
    fallback?: Prisma.BoardMinutesResolutionOrderByWithRelationInput[],
  ) {
    const filtered: Prisma.BoardMinutesResolutionWhereInput = {
      ...where,
      ...(query.status ? { status: query.status } : {}),
    };
    const orderBy = this.resolutionOrderBy(query, fallback);
    if (!wantsPagination(query)) {
      const items = await this.prisma.boardMinutesResolution.findMany({
        where: filtered,
        orderBy,
        include: resolutionInclude,
      });
      return items.map((item) => this.serializeResolution(item));
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.boardMinutesResolution.findMany({
        where: filtered,
        orderBy,
        skip,
        take,
        include: resolutionInclude,
      }),
      this.prisma.boardMinutesResolution.count({ where: filtered }),
    ]);
    return paginatedResult(
      items.map((item) => this.serializeResolution(item)),
      total,
      page,
      pageSize,
    );
  }

  private serializeResolution(
    item: Prisma.BoardMinutesResolutionGetPayload<{ include: typeof resolutionInclude }>,
  ) {
    return {
      id: item.id,
      minutesId: item.minutesId,
      title: item.title,
      description: item.description,
      status: item.status,
      unitId: item.executors[0]?.unit.id ?? null,
      unit: item.executors[0]?.unit ?? null,
      unitIds: item.executors.map((row) => row.unit.id),
      units: item.executors.map((row) => row.unit),
      dueKind: item.dueKind,
      dueDate: toIsoDateOnly(item.dueDate),
      hasTopicHistory: item.hasTopicHistory,
      legalBasis: item.legalBasis,
      proposerKind: item.proposerKind,
      proposerText: item.proposerText,
      proposerUnitId: item.proposerUnitId,
      proposerUnit: item.proposerUnit,
      notes: item.notes,
      signatories: item.signatories.map((row) => ({
        id: row.id,
        sourceSignatoryId: row.sourceSignatoryId,
        firstName: row.firstName,
        lastName: row.lastName,
        title: row.title,
        signatureImageId: row.signatureImageId,
        signedAt: toIsoDateOnly(row.signedAt),
        sortOrder: row.sortOrder,
      })),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      minutes: {
        id: item.minutes.id,
        subject: item.minutes.subject,
        heldAt: toIsoDateOnly(item.minutes.heldAt),
        minutesNo: item.minutes.minutesNo,
        status: item.minutes.status,
        requestId: item.minutes.requests[0]?.request.id ?? null,
        request: item.minutes.requests[0]?.request ?? null,
        requests: item.minutes.requests.map((row) => row.request),
      },
    };
  }

  private resolveResolutionDue(
    dto: { dueKind?: BoardResolutionDueKind; dueDate?: string | null },
    current?: { dueKind: BoardResolutionDueKind; dueDate: Date | null },
  ) {
    const dueKind = dto.dueKind ?? current?.dueKind ?? BoardResolutionDueKind.DATE;
    if (dueKind === BoardResolutionDueKind.ASAP) {
      return { dueKind, dueDate: null as Date | null };
    }
    const dueDate =
      dto.dueDate !== undefined
        ? parseOptionalIsoDate(dto.dueDate) ?? null
        : (current?.dueDate ?? null);
    if (!dueDate) {
      throw new BadRequestException('مهلت اجرا را وارد کنید');
    }
    return { dueKind, dueDate };
  }

  private resolveResolutionProposer(
    dto: {
      proposerKind?: BoardResolutionProposerKind;
      proposerText?: string | null;
      proposerUnitId?: string | null;
    },
    current?: {
      proposerKind: BoardResolutionProposerKind;
      proposerText: string | null;
      proposerUnitId: string | null;
    },
  ) {
    const proposerKind =
      dto.proposerKind ?? current?.proposerKind ?? BoardResolutionProposerKind.TEXT;
    if (proposerKind === BoardResolutionProposerKind.UNIT) {
      const proposerUnitId =
        dto.proposerUnitId !== undefined ? dto.proposerUnitId : current?.proposerUnitId;
      if (!proposerUnitId) {
        throw new BadRequestException('واحد پیشنهاد دهنده را انتخاب کنید');
      }
      return { proposerKind, proposerText: null as string | null, proposerUnitId };
    }
    const proposerText =
      dto.proposerText !== undefined
        ? dto.proposerText?.trim() || null
        : (current?.proposerText ?? null);
    if (!proposerText) {
      throw new BadRequestException('پیشنهاد دهنده را وارد کنید');
    }
    return { proposerKind, proposerText, proposerUnitId: null as string | null };
  }

  private async normalizeResolutionSignatories(
    rows?: BoardResolutionSignatoryDto[],
  ): Promise<Prisma.BoardResolutionSignatoryCreateWithoutResolutionInput[] | undefined> {
    if (rows === undefined) return undefined;
    const imageIds = [...new Set(rows.map((row) => row.signatureImageId))];
    if (imageIds.length) {
      const count = await this.prisma.storedImage.count({ where: { id: { in: imageIds } } });
      if (count !== imageIds.length) {
        throw new BadRequestException('تصویر امضا معتبر نیست');
      }
    }
    const sourceIds = [
      ...new Set(
        rows
          .map((row) => row.sourceSignatoryId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const existingSources = sourceIds.length
      ? await this.prisma.boardSignatory.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true },
        })
      : [];
    const sourceSet = new Set(existingSources.map((row) => row.id));
    const seen = new Set<string>();
    return rows.map((row, index) => {
      const sourceId =
        row.sourceSignatoryId && sourceSet.has(row.sourceSignatoryId)
          ? row.sourceSignatoryId
          : null;
      if (sourceId) {
        if (seen.has(sourceId)) {
          throw new BadRequestException('یک دارنده حق امضا بیش از یک بار انتخاب شده است');
        }
        seen.add(sourceId);
      }
      return {
        sourceSignatoryId: sourceId,
        firstName: row.firstName,
        lastName: row.lastName,
        title: row.title,
        signatureImageId: row.signatureImageId,
        signedAt: parseOptionalIsoDate(row.signedAt) ?? null,
        sortOrder: index,
      };
    });
  }
}
