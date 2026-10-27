import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { parseIsoDate, parseIsoDateAtNow, toIsoDateOnly } from '../common/iso-date';
import { gregorianToJalali } from '../common/jalali-date';
import { toLatinDigits } from '../common/national-id';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import {
  BoardAttachmentKind,
  BoardRequestKind,
  BoardRequestStatus,
  BoardStage,
  Prisma,
  UserStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BOARD_ADMIN_ROLE_CODE } from '../access/access.constants';
import { ORG_UNIT_KIND_CODES } from '../organization/organization.constants';
import {
  findNearestViceUnitId,
  organizationUnitSubtreeIds,
} from '../organization/organization-unit-tree';
import {
  AUTO_MANAGEMENT_COMMENT,
  BOARD_DEPUTY_POSITION_CODE,
  BOARD_LEADERSHIP_POSITION_CODES,
  BOARD_REQUEST_POSITION_CODES,
  BOARD_SECRETARY_POSITION_CODE,
  MAX_BOARD_ATTACHMENTS,
  boardPermissionStages,
  nextStatusAfterApprove,
  referredAtDataForStatus,
  stageForStatus,
} from './board.constants';
import {
  ReviewBoardRequestDto,
  UpdateBoardPermissionsDto,
  UpdateBoardRequestStatusDto,
} from './dto/board-actions.dto';
import { CreateBoardRequestDto } from './dto/create-board-request.dto';
import { FindBoardRequestsQueryDto } from './dto/find-board-requests-query.dto';
import { UpdateBoardRequestDto } from './dto/update-board-request.dto';

const personSelect = {
  id: true,
  fullName: true,
  username: true,
} satisfies Prisma.UserSelect;

const unitSelect = {
  id: true,
  name: true,
} satisfies Prisma.OrganizationUnitSelect;

const requestInclude = {
  unit: { select: unitSelect },
  createdBy: { select: personSelect },
  managementBy: { select: personSelect },
  legalBy: { select: personSelect },
  budgetBy: { select: personSelect },
  secretaryBy: { select: personSelect },
  ceoBy: { select: personSelect },
  rejectedBy: { select: personSelect },
  attachments: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      image: { select: { id: true, mimeType: true, originalName: true } },
      file: { select: { id: true, mimeType: true, originalName: true, byteSize: true } },
    },
  },
  _count: { select: { attachments: true } },
} satisfies Prisma.BoardRequestInclude;

type Actor = {
  id: string;
  isAdmin: boolean;
  isBoardAdmin: boolean;
  status: UserStatus;
  orgUnitId: string | null;
  positionId: string | null;
  positionCode: string | null;
  positionName: string | null;
};

function boardRequestSearchOr(q: string): Prisma.BoardRequestWhereInput[] {
  const latin = toLatinDigits(q).trim();
  const tracking = latin.replace(/[\s.\\-]+/g, '/');
  const trackingTerms = [...new Set([q.trim(), latin, tracking].filter(Boolean))];
  return [
    ...trackingTerms.map((term) => ({ trackingNo: containsInsensitive(term) })),
    { subject: containsInsensitive(q) },
    { orgPositionText: containsInsensitive(q) },
    { justification: containsInsensitive(q) },
    { unit: { name: containsInsensitive(q) } },
    { createdBy: { fullName: containsInsensitive(q) } },
  ];
}

@Injectable()
export class BoardService {
  constructor(private readonly prisma: PrismaService) {}

  async access(userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    const canSeeAll = await this.canSeeAllRequests(actor);
    const stages: Record<BoardStage, boolean> = {
      [BoardStage.REQUEST]: true,
      [BoardStage.MANAGEMENT]: await this.canActOnStage(actor, BoardStage.MANAGEMENT),
      [BoardStage.LEGAL]: await this.canActOnStage(actor, BoardStage.LEGAL),
      [BoardStage.BUDGET]: await this.canActOnStage(actor, BoardStage.BUDGET),
      [BoardStage.SECRETARY]: await this.canActOnStage(actor, BoardStage.SECRETARY),
      [BoardStage.CEO]: await this.canActOnStage(actor, BoardStage.CEO),
    };
    return {
      canAccess: true,
      canPickUnit: this.canPickUnit(actor),
      canSeeAll,
      canEditPermissions: actor.isAdmin || actor.isBoardAdmin,
      canChangeStage: actor.isAdmin,
      canManageMinutes: actor.isAdmin || actor.isBoardAdmin,
      canDeleteRequests: this.canDeleteRequests(actor),
      orgUnitId: actor.orgUnitId,
      positionName: actor.positionName,
      stages,
    };
  }

  async assertCanAccessBoard(userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    return actor;
  }

  async assertCanManageBoardSettings(userId: string) {
    const actor = await this.requireActor(userId);
    if (!actor.isAdmin && !actor.isBoardAdmin) {
      throw new ForbiddenException(
        'فقط مدیریت و مدیر ماژول هیئت مدیره به این بخش دسترسی دارند',
      );
    }
    return actor;
  }

  async getPermissions(userId: string) {
    await this.assertCanManageBoardSettings(userId);
    return this.loadPermissions();
  }

  async updatePermissions(userId: string, dto: UpdateBoardPermissionsDto) {
    await this.assertCanManageBoardSettings(userId);
    const seen = new Set<BoardStage>();
    for (const row of dto.stages) {
      if (seen.has(row.stage)) {
        throw new BadRequestException('هر مرحله فقط یک‌بار باید ارسال شود');
      }
      seen.add(row.stage);
    }
    for (const stage of boardPermissionStages) {
      if (!seen.has(stage)) {
        throw new BadRequestException('مجوز همهٔ مراحل بررسی را ارسال کنید');
      }
    }
    const unitIds = [...new Set(dto.stages.flatMap((row) => row.unitIds))];
    const positionIds = [...new Set(dto.stages.flatMap((row) => row.positionIds))];
    if (unitIds.length) {
      const count = await this.prisma.organizationUnit.count({
        where: { id: { in: unitIds } },
      });
      if (count !== unitIds.length) {
        throw new BadRequestException('یکی از واحدهای انتخاب‌شده معتبر نیست');
      }
    }
    if (positionIds.length) {
      const count = await this.prisma.organizationPosition.count({
        where: {
          id: { in: positionIds },
          code: { in: [...BOARD_LEADERSHIP_POSITION_CODES] },
        },
      });
      if (count !== positionIds.length) {
        throw new BadRequestException(
          'فقط سمت‌هایی که به ماژول هیئت مدیره دسترسی دارند معتبرند',
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.boardStageUnit.deleteMany({
        where: { stage: { in: [...boardPermissionStages, BoardStage.MANAGEMENT] } },
      });
      await tx.boardStagePosition.deleteMany({
        where: { stage: { in: [...boardPermissionStages, BoardStage.MANAGEMENT] } },
      });
      for (const row of dto.stages) {
        if (row.unitIds.length) {
          await tx.boardStageUnit.createMany({
            data: row.unitIds.map((unitId) => ({ stage: row.stage, unitId })),
          });
        }
        if (row.positionIds.length) {
          await tx.boardStagePosition.createMany({
            data: row.positionIds.map((positionId) => ({
              stage: row.stage,
              positionId,
            })),
          });
        }
      }
    });
    return this.loadPermissions();
  }

  async findMine(query: FindBoardRequestsQueryDto, userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    return this.findMany(query, { createdById: actor.id });
  }

  async findPlans(query: FindBoardRequestsQueryDto, userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    return this.findMany(query, await this.viewerWhere(actor));
  }

  async stats(userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    const where = await this.viewerWhere(actor);
    const grouped = await this.prisma.boardRequest.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const counts = Object.fromEntries(
      grouped.map((row) => [row.status, row._count._all]),
    ) as Record<BoardRequestStatus, number>;
    const total = grouped.reduce((sum, row) => sum + row._count._all, 0);
    return {
      total,
      pendingReview: counts.PENDING_REVIEW ?? 0,
      pendingLegal: counts.PENDING_LEGAL ?? 0,
      pendingBudget: counts.PENDING_BUDGET ?? 0,
      pendingSecretary: counts.PENDING_SECRETARY ?? 0,
      pendingCeo: counts.PENDING_CEO ?? 0,
      approved: counts.APPROVED ?? 0,
      rejected: counts.REJECTED ?? 0,
    };
  }

  async findOne(id: string, userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    const item = await this.prisma.boardRequest.findUnique({
      where: { id },
      include: requestInclude,
    });
    if (!item) {
      throw new NotFoundException('درخواست یافت نشد');
    }
    await this.assertCanView(actor, item);
    const stage = stageForStatus(item.status);
    return {
      ...this.serialize(item),
      canReview: stage
        ? await this.canActOnStage(actor, stage, item.unitId)
        : false,
      stageResponsibles: await this.loadStageResponsibles(item),
    };
  }

  async create(dto: CreateBoardRequestDto, userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    const unitId = this.resolveRequestUnit(actor, dto.unitId);
    await this.assertUnitExists(unitId);
    const position = await this.resolveRequestPosition(actor, dto.orgPositionText);
    const attachments = await this.buildAttachments(
      BoardStage.REQUEST,
      dto.imageIds,
      dto.fileIds,
    );
    const kind = this.resolveRequestKind(actor, dto.kind);
    const requestedAt = parseIsoDate(dto.requestedAt);
    const trackingYear = this.jalaliYearFromIso(dto.requestedAt);
    const autoManage =
      kind === BoardRequestKind.NORMAL &&
      position.code === BOARD_DEPUTY_POSITION_CODE;
    const status =
      kind === BoardRequestKind.MANAGEMENT
        ? BoardRequestStatus.PENDING_CEO
        : autoManage
          ? BoardRequestStatus.PENDING_LEGAL
          : BoardRequestStatus.PENDING_REVIEW;
    const created = await this.createWithTracking({
      kind,
      status,
      requestedAt,
      trackingYear,
      unitId,
      orgPositionText: position.name,
      subject: dto.subject,
      justification: dto.justification ?? null,
      topicHistory: dto.topicHistory ?? null,
      description: dto.description ?? null,
      createdById: actor.id,
      attachments,
      ...referredAtDataForStatus(status, new Date()),
      ...(autoManage
        ? {
            managementComment: AUTO_MANAGEMENT_COMMENT,
            managementAt: new Date(),
            managementById: actor.id,
          }
        : {}),
    });
    return this.serialize(created);
  }

  async update(id: string, dto: UpdateBoardRequestDto, userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    const current = await this.prisma.boardRequest.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('درخواست یافت نشد');
    }
    if (!this.canEditRequestContent(actor, current)) {
      if (current.createdById !== actor.id) {
        throw new ForbiddenException(
          'فقط ثبت‌کننده می‌تواند این درخواست را ویرایش کند',
        );
      }
      throw new ConflictException('پس از تأیید اولیه امکان ویرایش وجود ندارد');
    }
    const unitId =
      dto.unitId !== undefined ? this.resolveRequestUnit(actor, dto.unitId) : undefined;
    if (unitId) await this.assertUnitExists(unitId);
    const orgPositionText =
      dto.orgPositionText !== undefined
        ? (await this.resolveRequestPosition(actor, dto.orgPositionText)).name
        : undefined;
    const extra = await this.buildAttachments(
      BoardStage.REQUEST,
      dto.imageIds,
      dto.fileIds,
    );
    if (extra.length) {
      const existing = await this.prisma.boardAttachment.count({
        where: { requestId: id },
      });
      if (existing + extra.length > MAX_BOARD_ATTACHMENTS) {
        throw new BadRequestException('تعداد پیوست‌ها بیش از حد مجاز است');
      }
    }
    const updated = await this.prisma.boardRequest.update({
      where: { id },
      data: {
        requestedAt:
          dto.requestedAt !== undefined ? parseIsoDate(dto.requestedAt) : undefined,
        unitId,
        orgPositionText,
        subject: dto.subject,
        justification:
          dto.justification === undefined ? undefined : dto.justification,
        topicHistory: dto.topicHistory === undefined ? undefined : dto.topicHistory,
        description: dto.description === undefined ? undefined : dto.description,
        attachments: extra.length ? { create: extra } : undefined,
      },
      include: requestInclude,
    });
    return this.serialize(updated);
  }

  async remove(id: string, userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    if (!this.canDeleteRequests(actor)) {
      throw new ForbiddenException(
        'فقط مدیریت و مدیر ماژول هیئت مدیره می‌توانند درخواست را حذف کنند',
      );
    }
    const current = await this.prisma.boardRequest.findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });
    if (!current) {
      throw new NotFoundException('درخواست یافت نشد');
    }
    await this.assertCanView(actor, current);
    await this.prisma.boardRequest.delete({ where: { id } });
  }

  async review(id: string, dto: ReviewBoardRequestDto, userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    const current = await this.prisma.boardRequest.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException('درخواست یافت نشد');
    }
    const stage = stageForStatus(current.status);
    if (!stage) {
      throw new ConflictException('این پرونده در مرحلهٔ بررسی نیست');
    }
    if (!(await this.canActOnStage(actor, stage, current.unitId))) {
      throw new ForbiddenException('برای این مرحله مجوز ندارید');
    }
    const extra = await this.buildAttachments(stage, dto.imageIds, dto.fileIds);
    if (extra.length) {
      const existing = await this.prisma.boardAttachment.count({
        where: { requestId: id },
      });
      if (existing + extra.length > MAX_BOARD_ATTACHMENTS) {
        throw new BadRequestException('تعداد پیوست‌ها بیش از حد مجاز است');
      }
    }
    const occurredAt = parseIsoDateAtNow(dto.occurredAt);
    if (dto.decision === 'REJECT') {
      const updated = await this.prisma.boardRequest.update({
        where: { id },
        data: {
          status: BoardRequestStatus.REJECTED,
          rejectedStage: stage,
          rejectedComment: dto.comment ?? null,
          rejectedAt: occurredAt,
          rejectedBy: { connect: { id: actor.id } },
          attachments: extra.length ? { create: extra } : undefined,
          ...this.stageReviewFields(stage, actor.id, occurredAt, dto, false),
        },
        include: requestInclude,
      });
      return this.serialize(updated);
    }
    this.assertStageReviewFields(stage, dto);
    const next = nextStatusAfterApprove(current.status, current.kind);
    if (!next) {
      throw new ConflictException('امکان تأیید این مرحله وجود ندارد');
    }
    const updated = await this.prisma.boardRequest.update({
      where: { id },
      data: {
        status: next,
        attachments: extra.length ? { create: extra } : undefined,
        ...this.stageReviewFields(stage, actor.id, occurredAt, dto, true),
        ...referredAtDataForStatus(next, new Date()),
      },
      include: requestInclude,
    });
    return this.serialize(updated);
  }

  async updateStatus(id: string, dto: UpdateBoardRequestStatusDto, userId: string) {
    const actor = await this.requireActor(userId);
    if (!actor.isAdmin) {
      throw new ForbiddenException('فقط مدیر سامانه می‌تواند مرحله را عوض کند');
    }
    const currentSerialized = await this.findOne(id, userId);
    const referred = referredAtDataForStatus(dto.status, new Date());
    const updated = await this.prisma.boardRequest.update({
      where: { id },
      data: {
        status: dto.status,
        legalReferredAt:
          referred.legalReferredAt && !currentSerialized.legalReferredAt
            ? referred.legalReferredAt
            : undefined,
        budgetReferredAt:
          referred.budgetReferredAt && !currentSerialized.budgetReferredAt
            ? referred.budgetReferredAt
            : undefined,
        secretaryReferredAt:
          referred.secretaryReferredAt && !currentSerialized.secretaryReferredAt
            ? referred.secretaryReferredAt
            : undefined,
        ceoReferredAt:
          referred.ceoReferredAt && !currentSerialized.ceoReferredAt
            ? referred.ceoReferredAt
            : undefined,
      },
      include: requestInclude,
    });
    return this.serialize(updated);
  }

  private async findMany(
    query: FindBoardRequestsQueryDto,
    extraWhere: Prisma.BoardRequestWhereInput,
  ) {
    const rangeStart =
      query.from && query.to && query.from > query.to ? query.to : query.from;
    const rangeEnd =
      query.from && query.to && query.from > query.to ? query.from : query.to;
    const where: Prisma.BoardRequestWhereInput = {
      ...extraWhere,
      status: query.status,
      kind: query.kind,
      unitId: query.unitId,
      ...(rangeStart || rangeEnd
        ? {
            requestedAt: {
              ...(rangeStart ? { gte: parseIsoDate(rangeStart) } : {}),
              ...(rangeEnd ? { lte: parseIsoDate(rangeEnd) } : {}),
            },
          }
        : {}),
      OR: query.q ? boardRequestSearchOr(query.q) : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.BoardRequestOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        trackingNo: (dir) => ({ trackingYear: dir, trackingSeq: dir }),
        requestedAt: (dir) => ({ requestedAt: dir }),
        subject: (dir) => ({ subject: dir }),
        status: (dir) => ({ status: dir }),
        unit: (dir) => ({ unit: { name: dir } }),
        createdBy: (dir) => ({ createdBy: { fullName: dir } }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.boardRequest.findMany({
        where,
        orderBy,
        include: requestInclude,
      });
      return items.map((item) => this.serialize(item));
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.boardRequest.findMany({
        where,
        orderBy,
        skip,
        take,
        include: requestInclude,
      }),
      this.prisma.boardRequest.count({ where }),
    ]);
    return paginatedResult(
      items.map((item) => this.serialize(item)),
      total,
      page,
      pageSize,
    );
  }

  private formatStageResponsibleTitle(
    positions: { name: string }[],
    units: { name: string }[],
  ) {
    const titles = [...new Set(positions.map((row) => row.name).filter(Boolean))];
    const unitNames = [...new Set(units.map((row) => row.name).filter(Boolean))];
    if (!titles.length) return null;
    if (!unitNames.length) return titles.join('، ');
    return `${titles.join('، ')} — ${unitNames.join('، ')}`;
  }

  private async loadStageResponsibles(item: {
    kind: BoardRequestKind;
    unitId: string;
    orgPositionText: string;
    createdBy: { id: string; fullName: string; username: string };
  }) {
    const pipeline =
      item.kind === BoardRequestKind.MANAGEMENT
        ? [BoardStage.REQUEST, BoardStage.CEO]
        : [
            BoardStage.REQUEST,
            BoardStage.MANAGEMENT,
            ...boardPermissionStages,
          ];
    const needsPermissions = pipeline.some((stage) =>
      (boardPermissionStages as readonly BoardStage[]).includes(stage),
    );
    const needsManagement = pipeline.includes(BoardStage.MANAGEMENT);
    const [permissions, tree, deputy] = await Promise.all([
      needsPermissions ? this.loadPermissions() : Promise.resolve([]),
      needsManagement ? this.loadUnitTree() : Promise.resolve([]),
      needsManagement
        ? this.prisma.organizationPosition.findFirst({
            where: { code: BOARD_DEPUTY_POSITION_CODE },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);
    const rows: {
      stage: BoardStage;
      title: string;
      people: { id: string; fullName: string; username: string }[];
    }[] = [];

    if (pipeline.includes(BoardStage.REQUEST) && item.orgPositionText.trim()) {
      rows.push({
        stage: BoardStage.REQUEST,
        title: item.orgPositionText,
        people: [item.createdBy],
      });
    }

    if (needsManagement && deputy) {
      const viceId = findNearestViceUnitId(tree, item.unitId);
      const [vice, people] = viceId
        ? await Promise.all([
            this.prisma.organizationUnit.findUnique({
              where: { id: viceId },
              select: unitSelect,
            }),
            this.prisma.user.findMany({
              where: {
                status: UserStatus.ACTIVE,
                positionId: deputy.id,
                orgUnitId: viceId,
              },
              select: personSelect,
              orderBy: { fullName: 'asc' },
            }),
          ])
        : [null, []];
      const title = this.formatStageResponsibleTitle(
        [deputy],
        vice ? [vice] : [],
      );
      if (title) {
        rows.push({
          stage: BoardStage.MANAGEMENT,
          title,
          people,
        });
      }
    }

    const permissionRows = permissions.filter(
      (row) => pipeline.includes(row.stage) && row.positions.length > 0,
    );
    if (permissionRows.length) {
      const positionIds = [
        ...new Set(permissionRows.flatMap((row) => row.positions.map((position) => position.id))),
      ];
      const users = await this.prisma.user.findMany({
        where: {
          status: UserStatus.ACTIVE,
          positionId: { in: positionIds },
        },
        select: { ...personSelect, positionId: true, orgUnitId: true },
        orderBy: { fullName: 'asc' },
      });
      for (const row of permissionRows) {
        const title = this.formatStageResponsibleTitle(row.positions, row.units);
        if (!title) continue;
        const positionIdSet = new Set(row.positions.map((entry) => entry.id));
        const unitIdSet = new Set(row.units.map((entry) => entry.id));
        rows.push({
          stage: row.stage,
          title,
          people: users
            .filter(
              (user) =>
                Boolean(user.positionId) &&
                positionIdSet.has(user.positionId ?? '') &&
                (unitIdSet.size === 0 ||
                  Boolean(user.orgUnitId && unitIdSet.has(user.orgUnitId))),
            )
            .map(({ id, fullName, username }) => ({ id, fullName, username })),
        });
      }
    }

    return rows;
  }

  private async loadPermissions() {
    const [units, positions] = await Promise.all([
      this.prisma.boardStageUnit.findMany({
        include: { unit: { select: unitSelect } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.boardStagePosition.findMany({
        include: { position: { select: { id: true, name: true, code: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    return boardPermissionStages.map((stage) => ({
      stage,
      units: units.filter((row) => row.stage === stage).map((row) => row.unit),
      positions: positions
        .filter(
          (row) =>
            row.stage === stage &&
            (BOARD_LEADERSHIP_POSITION_CODES as readonly string[]).includes(
              row.position.code ?? '',
            ),
        )
        .map((row) => row.position),
    }));
  }

  private async requireActor(userId: string): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        orgUnitId: true,
        positionId: true,
        position: { select: { id: true, code: true, name: true } },
        userRoles: { select: { role: { select: { code: true } } } },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      isAdmin: user.userRoles.some((row) => row.role.code === 'ADMIN'),
      isBoardAdmin: user.userRoles.some((row) => row.role.code === BOARD_ADMIN_ROLE_CODE),
      status: user.status,
      orgUnitId: user.orgUnitId,
      positionId: user.positionId,
      positionCode: user.position?.code ?? null,
      positionName: user.position?.name ?? null,
    };
  }

  private assertBoardAccess(actor: Actor) {
    if (actor.isAdmin || actor.isBoardAdmin) return;
    if (
      actor.positionCode &&
      (BOARD_LEADERSHIP_POSITION_CODES as readonly string[]).includes(
        actor.positionCode,
      )
    ) {
      return;
    }
    throw new ForbiddenException('دسترسی به ماژول هیئت مدیره ندارید');
  }

  private canPickUnit(actor: Actor) {
    return (
      actor.isAdmin ||
      actor.isBoardAdmin ||
      actor.positionCode === BOARD_SECRETARY_POSITION_CODE
    );
  }

  private canDeleteRequests(actor: Actor) {
    return actor.isAdmin || actor.isBoardAdmin;
  }

  private canOverrideRequestLock(actor: Actor) {
    return actor.isAdmin || actor.isBoardAdmin;
  }

  private canEditRequestContent(
    actor: Actor,
    current: {
      createdById: string;
      kind: BoardRequestKind;
      status: BoardRequestStatus;
      ceoAt: Date | null;
    },
  ) {
    if (this.canOverrideRequestLock(actor)) return true;
    if (current.createdById !== actor.id) return false;
    return (
      current.status === BoardRequestStatus.PENDING_REVIEW ||
      (current.kind === BoardRequestKind.MANAGEMENT &&
        current.status === BoardRequestStatus.PENDING_CEO &&
        !current.ceoAt)
    );
  }

  private resolveRequestKind(actor: Actor, kind?: BoardRequestKind) {
    if (kind === BoardRequestKind.MANAGEMENT) {
      if (!actor.isAdmin && !actor.isBoardAdmin) {
        throw new ForbiddenException(
          'فقط مدیریت و مدیر ماژول هیئت مدیره می‌توانند درخواست مدیریتی ثبت کنند',
        );
      }
      return BoardRequestKind.MANAGEMENT;
    }
    return BoardRequestKind.NORMAL;
  }

  private resolveRequestUnit(actor: Actor, unitId?: string) {
    if (this.canPickUnit(actor)) {
      const id = unitId || actor.orgUnitId;
      if (!id) {
        throw new BadRequestException('واحد سازمانی را انتخاب کنید');
      }
      return id;
    }
    if (unitId && unitId !== actor.orgUnitId) {
      throw new ForbiddenException('فقط می‌توانید برای واحد خودتان درخواست ثبت کنید');
    }
    if (!actor.orgUnitId) {
      throw new BadRequestException('واحد سازمانی شما مشخص نیست');
    }
    return actor.orgUnitId;
  }

  private async resolveRequestPosition(actor: Actor, text?: string) {
    if (this.canPickUnit(actor)) {
      const value = text?.trim() ?? '';
      if (value.length < 2) {
        throw new BadRequestException('سمت سازمانی را انتخاب کنید');
      }
      const position = await this.prisma.organizationPosition.findFirst({
        where: {
          name: value,
          code: { in: [...BOARD_REQUEST_POSITION_CODES] },
        },
        select: { name: true, code: true },
      });
      if (!position?.code) {
        throw new BadRequestException(
          'سمت را از میان مدیر، معاون، رئیس یا سرپرست انتخاب کنید',
        );
      }
      return { name: position.name, code: position.code };
    }
    const name = actor.positionName?.trim() ?? '';
    const code = actor.positionCode;
    if (
      !code ||
      !(BOARD_REQUEST_POSITION_CODES as readonly string[]).includes(code) ||
      name.length < 2
    ) {
      throw new BadRequestException('سمت سازمانی شما برای ثبت درخواست معتبر نیست');
    }
    return { name, code };
  }

  private async assertUnitExists(id: string) {
    const unit = await this.prisma.organizationUnit.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!unit) {
      throw new BadRequestException('واحد سازمانی یافت نشد');
    }
  }

  private async canSeeAllRequests(actor: Actor) {
    if (actor.isAdmin || actor.isBoardAdmin) return true;
    if (!actor.orgUnitId) return false;
    const count = await this.prisma.boardStageUnit.count({
      where: {
        unitId: actor.orgUnitId,
        stage: { in: [...boardPermissionStages] },
      },
    });
    return count > 0;
  }

  private async deputySubtreeUnitIds(actor: Actor) {
    if (
      actor.status !== UserStatus.ACTIVE ||
      actor.positionCode !== BOARD_DEPUTY_POSITION_CODE ||
      !actor.orgUnitId
    ) {
      return [];
    }
    const unit = await this.prisma.organizationUnit.findUnique({
      where: { id: actor.orgUnitId },
      select: { id: true, kind: { select: { code: true } } },
    });
    if (unit?.kind.code !== ORG_UNIT_KIND_CODES.VICE) return [];
    const catalog = await this.prisma.organizationUnit.findMany({
      select: { id: true, parentId: true },
    });
    return organizationUnitSubtreeIds(catalog, unit.id);
  }

  private async viewerWhere(actor: Actor): Promise<Prisma.BoardRequestWhereInput> {
    if (await this.canSeeAllRequests(actor)) return {};
    const subtree = await this.deputySubtreeUnitIds(actor);
    if (!subtree.length) return { createdById: actor.id };
    return {
      OR: [{ createdById: actor.id }, { unitId: { in: subtree } }],
    };
  }

  private async loadUnitTree() {
    const units = await this.prisma.organizationUnit.findMany({
      select: { id: true, parentId: true, kind: { select: { code: true } } },
    });
    return units.map((unit) => ({
      id: unit.id,
      parentId: unit.parentId,
      kindCode: unit.kind.code,
    }));
  }

  private async canActOnStage(
    actor: Actor,
    stage: BoardStage,
    requestUnitId?: string,
  ) {
    if (actor.isAdmin) return true;
    if (stage === BoardStage.MANAGEMENT) {
      if (actor.isBoardAdmin) return true;
      if (actor.status !== UserStatus.ACTIVE) return false;
      if (actor.positionCode !== BOARD_DEPUTY_POSITION_CODE || !actor.orgUnitId) {
        return false;
      }
      if (!requestUnitId) {
        const unit = await this.prisma.organizationUnit.findUnique({
          where: { id: actor.orgUnitId },
          select: { kind: { select: { code: true } } },
        });
        return unit?.kind.code === ORG_UNIT_KIND_CODES.VICE;
      }
      const viceId = findNearestViceUnitId(await this.loadUnitTree(), requestUnitId);
      return viceId === actor.orgUnitId;
    }
    if (!actor.orgUnitId || !actor.positionId) return false;
    const [unitOk, positionOk] = await Promise.all([
      this.prisma.boardStageUnit.count({
        where: { stage, unitId: actor.orgUnitId },
      }),
      this.prisma.boardStagePosition.count({
        where: { stage, positionId: actor.positionId },
      }),
    ]);
    return unitOk > 0 && positionOk > 0;
  }

  private async assertCanView(
    actor: Actor,
    item: { createdById: string; unitId?: string },
  ) {
    if (actor.isAdmin || actor.isBoardAdmin || item.createdById === actor.id) return;
    if (await this.canSeeAllRequests(actor)) return;
    if (item.unitId) {
      const subtree = await this.deputySubtreeUnitIds(actor);
      if (subtree.includes(item.unitId)) return;
    }
    throw new ForbiddenException('دسترسی به این درخواست ندارید');
  }

  private async buildAttachments(
    stage: BoardStage,
    imageIds?: string[],
    fileIds?: string[],
  ) {
    const images = [...new Set(imageIds ?? [])];
    const files = [...new Set(fileIds ?? [])];
    if (images.length + files.length > MAX_BOARD_ATTACHMENTS) {
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
    if (files.length) {
      const count = await this.prisma.storedFile.count({
        where: { id: { in: files } },
      });
      if (count !== files.length) {
        throw new BadRequestException('یکی از فایل‌های پیوست معتبر نیست');
      }
    }
    return [
      ...images.map((imageId, index) => ({
        stage,
        kind: BoardAttachmentKind.IMAGE,
        imageId,
        sortOrder: index,
      })),
      ...files.map((fileId, index) => ({
        stage,
        kind: BoardAttachmentKind.FILE,
        fileId,
        sortOrder: images.length + index,
      })),
    ];
  }

  private assertStageReviewFields(stage: BoardStage, dto: ReviewBoardRequestDto) {
    if (stage === BoardStage.LEGAL) {
      if (dto.legalOrgMatch == null || dto.legalRegulationsMatch == null) {
        throw new BadRequestException('فیلدهای مطابقت حقوقی را مشخص کنید');
      }
    }
    if (stage === BoardStage.BUDGET) {
      if (
        dto.budgetProgramHistory == null ||
        dto.budgetCurrentYearFunding == null
      ) {
        throw new BadRequestException('فیلدهای بررسی بودجه را مشخص کنید');
      }
    }
  }

  private stageReviewFields(
    stage: BoardStage,
    userId: string,
    occurredAt: Date,
    dto: ReviewBoardRequestDto,
    approved: boolean,
  ): Prisma.BoardRequestUpdateInput {
    const comment = dto.comment ?? null;
    if (stage === BoardStage.MANAGEMENT) {
      return {
        managementComment: comment,
        managementAt: occurredAt,
        managementBy: { connect: { id: userId } },
      };
    }
    if (stage === BoardStage.LEGAL) {
      return {
        legalComment: comment,
        legalAt: occurredAt,
        legalBy: { connect: { id: userId } },
        legalOrgMatch: approved ? dto.legalOrgMatch : dto.legalOrgMatch ?? undefined,
        legalRegulationsMatch: approved
          ? dto.legalRegulationsMatch
          : dto.legalRegulationsMatch ?? undefined,
      };
    }
    if (stage === BoardStage.BUDGET) {
      return {
        budgetComment: comment,
        budgetAt: occurredAt,
        budgetBy: { connect: { id: userId } },
        budgetProgramHistory: approved
          ? dto.budgetProgramHistory
          : dto.budgetProgramHistory ?? undefined,
        budgetCurrentYearFunding: approved
          ? dto.budgetCurrentYearFunding
          : dto.budgetCurrentYearFunding ?? undefined,
      };
    }
    if (stage === BoardStage.SECRETARY) {
      return {
        secretaryComment: comment,
        secretaryAt: occurredAt,
        secretaryBy: { connect: { id: userId } },
      };
    }
    return {
      ceoComment: comment,
      ceoAt: occurredAt,
      ceoBy: { connect: { id: userId } },
    };
  }

  private jalaliYearFromIso(iso: string) {
    const [year, month, day] = iso.split('-').map(Number);
    if (!year || !month || !day) {
      throw new BadRequestException('تاریخ درخواست معتبر نیست');
    }
    return gregorianToJalali(year, month, day).year;
  }

  private async createWithTracking(data: {
    kind: BoardRequestKind;
    status: BoardRequestStatus;
    requestedAt: Date;
    trackingYear: number;
    unitId: string;
    orgPositionText: string;
    subject: string;
    justification: string | null;
    topicHistory: string | null;
    description: string | null;
    createdById: string;
    attachments: Awaited<ReturnType<BoardService['buildAttachments']>>;
    managementComment?: string;
    managementAt?: Date;
    managementById?: string;
    legalReferredAt?: Date;
    budgetReferredAt?: Date;
    secretaryReferredAt?: Date;
    ceoReferredAt?: Date;
  }) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const last = await tx.boardRequest.findFirst({
            where: { trackingYear: data.trackingYear },
            orderBy: { trackingSeq: 'desc' },
            select: { trackingSeq: true },
          });
          const trackingSeq = (last?.trackingSeq ?? 0) + 1;
          return tx.boardRequest.create({
            data: {
              kind: data.kind,
              status: data.status,
              requestedAt: data.requestedAt,
              trackingYear: data.trackingYear,
              trackingSeq,
              trackingNo: `${data.trackingYear}/${trackingSeq}`,
              unitId: data.unitId,
              orgPositionText: data.orgPositionText,
              subject: data.subject,
              justification: data.justification,
              topicHistory: data.topicHistory,
              description: data.description,
              createdById: data.createdById,
              managementComment: data.managementComment,
              managementAt: data.managementAt,
              managementById: data.managementById,
              legalReferredAt: data.legalReferredAt,
              budgetReferredAt: data.budgetReferredAt,
              secretaryReferredAt: data.secretaryReferredAt,
              ceoReferredAt: data.ceoReferredAt,
              attachments: data.attachments.length
                ? { create: data.attachments }
                : undefined,
            },
            include: requestInclude,
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

  private serialize(
    item: Prisma.BoardRequestGetPayload<{ include: typeof requestInclude }>,
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
          row.originalName ||
          row.image?.originalName ||
          row.file?.originalName ||
          null,
        mimeType: row.image?.mimeType || row.file?.mimeType || null,
        byteSize: row.file?.byteSize ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
