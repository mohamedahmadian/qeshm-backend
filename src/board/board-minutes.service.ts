import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { parseIsoDate, parseOptionalIsoDate, toIsoDateOnly } from '../common/iso-date';
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
  BoardRequestStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BOARD_ADMIN_ROLE_CODE } from '../access/access.constants';
import {
  MAX_BOARD_ATTACHMENTS,
  MAX_BOARD_MINUTES_MEMBERS,
} from './board.constants';
import {
  BoardMinutesMemberDto,
  CreateBoardMinutesDto,
} from './dto/create-board-minutes.dto';
import { CreateBoardResolutionDto } from './dto/create-board-resolution.dto';
import { FindBoardMinutesQueryDto } from './dto/find-board-minutes-query.dto';
import { FindBoardResolutionsQueryDto } from './dto/find-board-resolutions-query.dto';
import { UpdateBoardMinutesDto } from './dto/update-board-minutes.dto';
import { UpdateBoardResolutionDto } from './dto/update-board-resolution.dto';

const personSelect = {
  id: true,
  fullName: true,
  username: true,
} satisfies Prisma.UserSelect;

const unitSelect = {
  id: true,
  name: true,
} satisfies Prisma.OrganizationUnitSelect;

const minutesInclude = {
  request: { select: { id: true, subject: true, status: true } },
  createdBy: { select: personSelect },
  members: {
    orderBy: { createdAt: 'asc' as const },
    include: { user: { select: personSelect } },
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
  _count: { select: { members: true, resolutions: true, attachments: true } },
} satisfies Prisma.BoardMinutesInclude;

const resolutionInclude = {
  unit: { select: unitSelect },
  minutes: {
    select: {
      id: true,
      subject: true,
      heldAt: true,
      requestId: true,
      request: { select: { id: true, subject: true, status: true } },
    },
  },
} satisfies Prisma.BoardMinutesResolutionInclude;

const searchInclude = {
  request: {
    select: {
      id: true,
      subject: true,
      status: true,
      justification: true,
      topicHistory: true,
      description: true,
      orgPositionText: true,
      unit: { select: unitSelect },
    },
  },
  createdBy: { select: personSelect },
  members: {
    include: { user: { select: personSelect } },
  },
  resolutions: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
    include: { unit: { select: unitSelect } },
  },
  _count: { select: { resolutions: true } },
} satisfies Prisma.BoardMinutesInclude;

const searchRequestInclude = {
  unit: { select: unitSelect },
  createdBy: { select: personSelect },
  _count: { select: { minutes: true } },
} satisfies Prisma.BoardRequestInclude;

const dossierRequestInclude = {
  unit: { select: unitSelect },
  createdBy: { select: personSelect },
  managementBy: { select: personSelect },
  legalBy: { select: personSelect },
  budgetBy: { select: personSelect },
  secretaryBy: { select: personSelect },
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
  constructor(private readonly prisma: PrismaService) {}

  async stats(userId: string) {
    await this.requireMinutesActor(userId);
    const [total, linked, resolutionCount] = await Promise.all([
      this.prisma.boardMinutes.count(),
      this.prisma.boardMinutes.count({ where: { requestId: { not: null } } }),
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
      select: { id: true, subject: true, requestedAt: true },
      orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
    });
    return items.map((item) => ({
      id: item.id,
      subject: item.subject,
      requestedAt: toIsoDateOnly(item.requestedAt),
    }));
  }

  async findAll(query: FindBoardMinutesQueryDto, userId: string) {
    await this.requireMinutesActor(userId);
    const where: Prisma.BoardMinutesWhereInput = {
      ...(query.requestId
        ? { requestId: query.requestId }
        : query.kind === 'regular'
          ? { requestId: null }
          : query.kind === 'linked'
            ? { requestId: { not: null } }
            : {}),
      OR: query.q
        ? [
            { subject: containsInsensitive(query.q) },
            { body: containsInsensitive(query.q) },
            { request: { subject: containsInsensitive(query.q) } },
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
        heldAt: (dir) => ({ heldAt: dir }),
        subject: (dir) => ({ subject: dir }),
        request: (dir) => ({ request: { subject: dir } }),
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
    const [request, resolutions] = await Promise.all([
      minutes.requestId
        ? this.prisma.boardRequest.findUnique({
            where: { id: minutes.requestId },
            include: dossierRequestInclude,
          })
        : Promise.resolve(null),
      this.prisma.boardMinutesResolution.findMany({
        where: { minutesId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { unit: { select: unitSelect } },
      }),
    ]);
    return {
      minutes: this.serializeMinutes(minutes),
      request: request ? this.serializeDossierRequest(request) : null,
      resolutions: resolutions.map((item) => ({
        id: item.id,
        minutesId: item.minutesId,
        title: item.title,
        description: item.description,
        unitId: item.unitId,
        unit: item.unit,
        dueDate: toIsoDateOnly(item.dueDate),
        notes: item.notes,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }

  async create(dto: CreateBoardMinutesDto, userId: string) {
    const actor = await this.requireMinutesActor(userId);
    const requestId = await this.resolveRequestId(dto.requestId);
    const members = await this.normalizeMembers(dto.members);
    const attachments = await this.buildAttachments(dto.imageIds, dto.audioIds);
    const created = await this.prisma.boardMinutes.create({
      data: {
        heldAt: parseIsoDate(dto.heldAt),
        subject: dto.subject,
        body: dto.body ?? null,
        requestId,
        createdById: actor.id,
        members: members.length ? { create: members } : undefined,
        attachments: attachments.length ? { create: attachments } : undefined,
      },
      include: minutesInclude,
    });
    return this.serializeMinutes(created);
  }

  async update(id: string, dto: UpdateBoardMinutesDto, userId: string) {
    await this.requireMinutesActor(userId);
    await this.loadMinutes(id);
    const requestId =
      dto.requestId !== undefined ? await this.resolveRequestId(dto.requestId) : undefined;
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
      return tx.boardMinutes.update({
        where: { id },
        data: {
          heldAt: dto.heldAt !== undefined ? parseIsoDate(dto.heldAt) : undefined,
          subject: dto.subject,
          body: dto.body === undefined ? undefined : dto.body,
          requestId,
          members: members?.length ? { create: members } : undefined,
          attachments: attachments?.length ? { create: attachments } : undefined,
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

  async createResolution(minutesId: string, dto: CreateBoardResolutionDto, userId: string) {
    await this.requireMinutesActor(userId);
    await this.loadMinutes(minutesId);
    if (dto.unitId) await this.assertUnitExists(dto.unitId);
    const created = await this.prisma.boardMinutesResolution.create({
      data: {
        minutesId,
        title: dto.title,
        description: dto.description ?? null,
        unitId: dto.unitId ?? null,
        dueDate: parseOptionalIsoDate(dto.dueDate) ?? null,
        notes: dto.notes ?? null,
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
    await this.loadResolution(minutesId, id);
    if (dto.unitId) await this.assertUnitExists(dto.unitId);
    const updated = await this.prisma.boardMinutesResolution.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description === undefined ? undefined : dto.description,
        unitId: dto.unitId,
        dueDate:
          dto.dueDate === undefined ? undefined : parseOptionalIsoDate(dto.dueDate) ?? null,
        notes: dto.notes === undefined ? undefined : dto.notes,
      },
      include: resolutionInclude,
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

  private async resolveRequestId(requestId?: string | null) {
    if (!requestId) return null;
    const request = await this.prisma.boardRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true },
    });
    if (!request) {
      throw new BadRequestException('درخواست طرح موضوع یافت نشد');
    }
    if (request.status !== BoardRequestStatus.APPROVED) {
      throw new BadRequestException('فقط پس از تأیید نهایی می‌توان صورت‌جلسه ثبت کرد');
    }
    return request.id;
  }

  private async normalizeMembers(members?: BoardMinutesMemberDto[]) {
    const list = members ?? [];
    if (list.length > MAX_BOARD_MINUTES_MEMBERS) {
      throw new BadRequestException('تعداد اعضا بیش از حد مجاز است');
    }
    const unique = new Map<string, BoardMinutesAttendance>();
    for (const row of list) {
      unique.set(
        row.userId,
        row.attendance === 'ABSENT'
          ? BoardMinutesAttendance.ABSENT
          : BoardMinutesAttendance.PRESENT,
      );
    }
    const userIds = [...unique.keys()];
    if (!userIds.length) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, orgUnitId: { not: null } },
      select: { id: true },
    });
    if (users.length !== userIds.length) {
      throw new BadRequestException('یکی از اعضای انتخاب‌شده کارمند معتبر نیست');
    }
    return userIds.map((userId) => ({
      userId,
      attendance: unique.get(userId) ?? BoardMinutesAttendance.PRESENT,
    }));
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
      { unit: { name: text } },
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
      { createdBy: { fullName: text } },
      { managementComment: text },
      { legalComment: text },
      { budgetComment: text },
      { secretaryComment: text },
      { rejectedComment: text },
    ];
  }

  private smartSearchWhere(q: string): Prisma.BoardMinutesWhereInput['OR'] {
    const text = containsInsensitive(q);
    return [
      { subject: text },
      { body: text },
      { createdBy: { fullName: text } },
      { members: { some: { user: { fullName: text } } } },
      { request: { subject: text } },
      { request: { justification: text } },
      { request: { topicHistory: text } },
      { request: { description: text } },
      { request: { orgPositionText: text } },
      { request: { unit: { name: text } } },
      { resolutions: { some: { title: text } } },
      { resolutions: { some: { description: text } } },
      { resolutions: { some: { notes: text } } },
      { resolutions: { some: { unit: { name: text } } } },
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
        includesInsensitive(row.unit?.name, q),
    );
    const matchIn = [
      ...(includesInsensitive(item.subject, q) ||
      includesInsensitive(item.body, q) ||
      includesInsensitive(item.createdBy.fullName, q) ||
      item.members.some((row) => includesInsensitive(row.user.fullName, q))
        ? (['minutes'] as const)
        : []),
      ...(item.request &&
      (includesInsensitive(item.request.subject, q) ||
        includesInsensitive(item.request.justification, q) ||
        includesInsensitive(item.request.topicHistory, q) ||
        includesInsensitive(item.request.description, q) ||
        includesInsensitive(item.request.orgPositionText, q) ||
        includesInsensitive(item.request.unit.name, q))
        ? (['request'] as const)
        : []),
      ...(matchedResolutions.length ? (['resolution'] as const) : []),
    ];
    const snippet =
      makeSnippet(item.subject, q) ||
      makeSnippet(item.body, q) ||
      makeSnippet(item.request?.subject, q) ||
      makeSnippet(item.request?.justification, q) ||
      makeSnippet(item.request?.topicHistory, q) ||
      makeSnippet(item.request?.description, q) ||
      makeSnippet(matchedResolutions[0]?.title, q) ||
      makeSnippet(matchedResolutions[0]?.description, q) ||
      makeSnippet(matchedResolutions[0]?.notes, q) ||
      null;
    return {
      kind: 'minutes' as const,
      id: item.id,
      subject: item.subject,
      heldAt: toIsoDateOnly(item.heldAt),
      body: item.body,
      request: item.request
        ? { id: item.request.id, subject: item.request.subject, status: item.request.status }
        : null,
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
      minutesCount: item._count.minutes,
    };
  }

  private serializeDossierRequest(
    item: Prisma.BoardRequestGetPayload<{ include: typeof dossierRequestInclude }>,
  ) {
    return {
      ...item,
      requestedAt: toIsoDateOnly(item.requestedAt),
      managementAt: toIsoDateOnly(item.managementAt),
      legalAt: toIsoDateOnly(item.legalAt),
      budgetAt: toIsoDateOnly(item.budgetAt),
      secretaryAt: toIsoDateOnly(item.secretaryAt),
      rejectedAt: toIsoDateOnly(item.rejectedAt),
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
    return {
      id: item.id,
      requestId: item.requestId,
      request: item.request,
      heldAt: toIsoDateOnly(item.heldAt),
      subject: item.subject,
      body: item.body,
      createdById: item.createdById,
      createdBy: item.createdBy,
      members: item.members.map((row) => ({
        id: row.id,
        userId: row.userId,
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
      { unit: { name: containsInsensitive(q) } },
      { minutes: { subject: containsInsensitive(q) } },
      { minutes: { body: containsInsensitive(q) } },
      { minutes: { request: { subject: containsInsensitive(q) } } },
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
        unit: (dir) => ({ unit: { name: dir } }),
        dueDate: (dir) => ({ dueDate: dir }),
        minutes: (dir) => ({ minutes: { subject: dir } }),
        request: (dir) => ({ minutes: { request: { subject: dir } } }),
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
    const orderBy = this.resolutionOrderBy(query, fallback);
    if (!wantsPagination(query)) {
      const items = await this.prisma.boardMinutesResolution.findMany({
        where,
        orderBy,
        include: resolutionInclude,
      });
      return items.map((item) => this.serializeResolution(item));
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.boardMinutesResolution.findMany({
        where,
        orderBy,
        skip,
        take,
        include: resolutionInclude,
      }),
      this.prisma.boardMinutesResolution.count({ where }),
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
      unitId: item.unitId,
      unit: item.unit,
      dueDate: toIsoDateOnly(item.dueDate),
      notes: item.notes,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      minutes: {
        id: item.minutes.id,
        subject: item.minutes.subject,
        heldAt: toIsoDateOnly(item.minutes.heldAt),
        requestId: item.minutes.requestId,
        request: item.minutes.request,
      },
    };
  }
}
