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
