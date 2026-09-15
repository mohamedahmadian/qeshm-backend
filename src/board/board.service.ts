import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { parseIsoDate, toIsoDateOnly } from '../common/iso-date';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import {
  BoardAttachmentKind,
  BoardRequestStatus,
  BoardStage,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BOARD_ADMIN_ROLE_CODE } from '../access/access.constants';
import {
  BOARD_LEADERSHIP_POSITION_CODES,
  MAX_BOARD_ATTACHMENTS,
  boardReviewStages,
  nextStatusAfterApprove,
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
  orgUnitId: string | null;
  positionId: string | null;
  positionCode: string | null;
  positionName: string | null;
};

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
    };
    return {
      canAccess: true,
      canPickUnit: this.canPickUnit(actor),
      canSeeAll,
      canEditPermissions: actor.isAdmin,
      canChangeStage: actor.isAdmin,
      canManageMinutes: actor.isAdmin || actor.isBoardAdmin,
      orgUnitId: actor.orgUnitId,
      positionName: actor.positionName,
      stages,
    };
  }

  async getPermissions(userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    return this.loadPermissions();
  }

  async updatePermissions(userId: string, dto: UpdateBoardPermissionsDto) {
    const actor = await this.requireActor(userId);
    if (!actor.isAdmin) {
      throw new ForbiddenException('فقط مدیر سامانه می‌تواند مجوزها را ویرایش کند');
    }
    const seen = new Set<BoardStage>();
    for (const row of dto.stages) {
      if (seen.has(row.stage)) {
        throw new BadRequestException('هر مرحله فقط یک‌بار باید ارسال شود');
      }
      seen.add(row.stage);
    }
    for (const stage of boardReviewStages) {
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
        where: { id: { in: positionIds } },
      });
      if (count !== positionIds.length) {
        throw new BadRequestException('یکی از سمت‌های انتخاب‌شده معتبر نیست');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.boardStageUnit.deleteMany({
        where: { stage: { in: [...boardReviewStages] } },
      });
      await tx.boardStagePosition.deleteMany({
        where: { stage: { in: [...boardReviewStages] } },
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
    const seeAll = await this.canSeeAllRequests(actor);
    return this.findMany(query, seeAll ? {} : { createdById: actor.id });
  }

  async stats(userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    const seeAll = await this.canSeeAllRequests(actor);
    const where: Prisma.BoardRequestWhereInput = seeAll
      ? {}
      : { createdById: actor.id };
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
    return this.serialize(item);
  }

  async create(dto: CreateBoardRequestDto, userId: string) {
    const actor = await this.requireActor(userId);
    this.assertBoardAccess(actor);
    const unitId = this.resolveRequestUnit(actor, dto.unitId);
    await this.assertUnitExists(unitId);
    const orgPositionText = this.resolveRequestPosition(actor, dto.orgPositionText);
    const attachments = await this.buildAttachments(
      BoardStage.REQUEST,
      dto.imageIds,
      dto.fileIds,
    );
    const created = await this.prisma.boardRequest.create({
      data: {
        requestedAt: parseIsoDate(dto.requestedAt),
        unitId,
        orgPositionText,
        subject: dto.subject,
        justification: dto.justification ?? null,
        topicHistory: dto.topicHistory ?? null,
        description: dto.description ?? null,
        createdById: actor.id,
        attachments: attachments.length ? { create: attachments } : undefined,
      },
      include: requestInclude,
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
    if (current.status !== BoardRequestStatus.PENDING_REVIEW) {
      throw new ConflictException('پس از تأیید اولیه امکان ویرایش وجود ندارد');
    }
    if (current.createdById !== actor.id && !actor.isAdmin) {
      throw new ForbiddenException('فقط ثبت‌کننده می‌تواند این درخواست را ویرایش کند');
    }
    const unitId =
      dto.unitId !== undefined ? this.resolveRequestUnit(actor, dto.unitId) : undefined;
    if (unitId) await this.assertUnitExists(unitId);
    const orgPositionText =
      dto.orgPositionText !== undefined
        ? this.resolveRequestPosition(actor, dto.orgPositionText)
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
    if (!(await this.canActOnStage(actor, stage))) {
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
    const occurredAt = parseIsoDate(dto.occurredAt);
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
    const next = nextStatusAfterApprove(current.status);
    if (!next) {
      throw new ConflictException('امکان تأیید این مرحله وجود ندارد');
    }
    const updated = await this.prisma.boardRequest.update({
      where: { id },
      data: {
        status: next,
        attachments: extra.length ? { create: extra } : undefined,
        ...this.stageReviewFields(stage, actor.id, occurredAt, dto, true),
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
    await this.findOne(id, userId);
    const updated = await this.prisma.boardRequest.update({
      where: { id },
      data: { status: dto.status },
      include: requestInclude,
    });
    return this.serialize(updated);
  }

  private async findMany(
    query: FindBoardRequestsQueryDto,
    extraWhere: Prisma.BoardRequestWhereInput,
  ) {
    const where: Prisma.BoardRequestWhereInput = {
      ...extraWhere,
      status: query.status,
      unitId: query.unitId,
      OR: query.q
        ? [
            { subject: containsInsensitive(query.q) },
            { orgPositionText: containsInsensitive(query.q) },
            { justification: containsInsensitive(query.q) },
            { unit: { name: containsInsensitive(query.q) } },
            { createdBy: { fullName: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.BoardRequestOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
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
    return boardReviewStages.map((stage) => ({
      stage,
      units: units.filter((row) => row.stage === stage).map((row) => row.unit),
      positions: positions
        .filter((row) => row.stage === stage)
        .map((row) => row.position),
    }));
  }

  private async requireActor(userId: string): Promise<Actor> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
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
    return actor.isAdmin || actor.isBoardAdmin;
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

  private resolveRequestPosition(actor: Actor, text?: string) {
    if (this.canPickUnit(actor)) {
      const value = text?.trim() ?? '';
      if (value.length < 2) {
        throw new BadRequestException('سمت سازمانی را انتخاب کنید');
      }
      return value;
    }
    const own = actor.positionName?.trim() ?? '';
    if (own.length < 2) {
      throw new BadRequestException('سمت سازمانی شما مشخص نیست');
    }
    return own;
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
        stage: { in: [...boardReviewStages] },
      },
    });
    return count > 0;
  }

  private async canActOnStage(actor: Actor, stage: BoardStage) {
    if (actor.isAdmin) return true;
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
    item: { createdById: string },
  ) {
    if (actor.isAdmin || actor.isBoardAdmin || item.createdById === actor.id) return;
    if (await this.canSeeAllRequests(actor)) return;
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
    return {
      secretaryComment: comment,
      secretaryAt: occurredAt,
      secretaryBy: { connect: { id: userId } },
    };
  }

  private serialize(
    item: Prisma.BoardRequestGetPayload<{ include: typeof requestInclude }>,
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
