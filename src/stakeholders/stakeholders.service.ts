import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
} from '../common/pagination';
import { parseOptionalIsoDate, toIsoDateOnly } from '../common/iso-date';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  attachmentSelect,
  buildStakeholderAttachments,
} from './stakeholders.attachments';
import { StakeholdersAccess } from './stakeholders.access';
import {
  CreateCorrespondenceDto,
  CreateProgressReportDto,
  CreateStakeholderMessageDto,
  FindCorrespondencesQueryDto,
  FindPortalProjectsQueryDto,
  FindProgressReportsQueryDto,
  UpdateCorrespondenceDto,
  UpdateCorrespondenceWorkflowDto,
  UpdateProgressReportDto,
} from './dto/stakeholder.dto';

const personSelect = { id: true, fullName: true } as const;

const attachmentInclude = {
  orderBy: { sortOrder: 'asc' as const },
  select: attachmentSelect,
};

function blankToNull(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function assertReportContent(input: {
  progressPercent?: number | null;
  actionsDone?: string | null;
  nextPlan?: string | null;
  blockers?: string | null;
  needs?: string | null;
  attachmentCount: number;
}) {
  const hasText = [input.actionsDone, input.nextPlan, input.blockers, input.needs].some(
    (value) => Boolean(value?.trim()),
  );
  if (!hasText && input.progressPercent == null && input.attachmentCount === 0) {
    throw new BadRequestException('حداقل یکی از شرح اقدام، درصد یا مستند را وارد کنید');
  }
}

@Injectable()
export class StakeholdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StakeholdersAccess,
  ) {}

  async listContractors() {
    return this.prisma.projectContractor.findMany({
      orderBy: [{ name: 'asc' }],
      select: { id: true, name: true },
    });
  }

  async listProjects(userId: string | undefined, query: FindPortalProjectsQueryDto) {
    const actor = await this.access.actor(userId);
    const { page, pageSize, skip, take } = paginationArgs(query);
    if (!actor.contractorId) {
      return paginatedResult([], 0, page, pageSize);
    }
    const where: Prisma.ProjectWhereInput = {
      OR: [
        { id: { in: await this.assignedProjectIds(actor.contractorId) } },
      ],
      ...(query.q
        ? {
            AND: [
              {
                OR: [
                  { systemName: containsInsensitive(query.q) },
                  { code: containsInsensitive(query.q) },
                ],
              },
            ],
          }
        : {}),
    };
    const orderBy = resolveSortOrder<Prisma.ProjectOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        systemName: (dir) => ({ systemName: dir }),
        code: (dir) => ({ code: dir }),
        status: (dir) => ({ status: dir }),
        progressPercent: (dir) => ({ progressPercent: dir }),
        startDate: (dir) => ({ startDate: dir }),
      },
      [{ systemName: 'asc' }, { id: 'asc' }],
    );
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          systemName: true,
          code: true,
          status: true,
          progressPercent: true,
          startDate: true,
          endDate: true,
          address: true,
          description: true,
          isActive: true,
        },
      }),
      this.prisma.project.count({ where }),
    ]);
    return paginatedResult(
      items.map((item) => ({
        ...item,
        startDate: toIsoDateOnly(item.startDate),
        endDate: toIsoDateOnly(item.endDate),
      })),
      total,
      page,
      pageSize,
    );
  }

  async projectOptions(userId: string | undefined) {
    const actor = await this.access.actor(userId);
    const contractorId = this.access.contractorId(actor);
    const ids = await this.assignedProjectIds(contractorId);
    return this.prisma.project.findMany({
      where: { id: { in: ids } },
      orderBy: { systemName: 'asc' },
      select: { id: true, systemName: true, code: true },
    });
  }

  async findProject(userId: string | undefined, projectId: string) {
    const actor = await this.access.actor(userId);
    const contractorId = this.access.contractorId(actor);
    await this.access.assertAssignedProject(contractorId, projectId);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        systemName: true,
        code: true,
        status: true,
        progressPercent: true,
        startDate: true,
        endDate: true,
        address: true,
        description: true,
        isActive: true,
        orgUnit: { select: { id: true, name: true } },
      },
    });
    if (!project) {
      throw new NotFoundException('پروژه یافت نشد');
    }
    const [reports, correspondences] = await this.prisma.$transaction([
      this.prisma.stakeholderProgressReport.findMany({
        where: { projectId, contractorId },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 8,
        select: {
          id: true,
          occurredAt: true,
          progressPercent: true,
          actionsDone: true,
          createdAt: true,
        },
      }),
      this.prisma.stakeholderCorrespondence.findMany({
        where: { projectId, contractorId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          subject: true,
          kind: true,
          status: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      ...project,
      startDate: toIsoDateOnly(project.startDate),
      endDate: toIsoDateOnly(project.endDate),
      reports: reports.map((item) => ({
        ...item,
        occurredAt: toIsoDateOnly(item.occurredAt),
      })),
      correspondences,
    };
  }

  async listProgress(userId: string | undefined, query: FindProgressReportsQueryDto) {
    const actor = await this.access.actor(userId);
    const { page, pageSize, skip, take } = paginationArgs(query);
    const where = this.progressWhere(actor.contractorId, query);
    const orderBy = resolveSortOrder<Prisma.StakeholderProgressReportOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        occurredAt: (dir) => ({ occurredAt: dir }),
        progressPercent: (dir) => ({ progressPercent: dir }),
        project: (dir) => ({ project: { systemName: dir } }),
        contractor: (dir) => ({ contractor: { name: dir } }),
        author: (dir) => ({ createdBy: { fullName: dir } }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ occurredAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    );
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stakeholderProgressReport.findMany({
        where,
        orderBy,
        skip,
        take,
        select: this.progressListSelect,
      }),
      this.prisma.stakeholderProgressReport.count({ where }),
    ]);
    return paginatedResult(items.map((item) => this.mapProgress(item)), total, page, pageSize);
  }

  async findProgress(userId: string | undefined, id: string) {
    const actor = await this.access.actor(userId);
    const row = await this.prisma.stakeholderProgressReport.findFirst({
      where: { id, ...this.access.contractorWhere(actor) },
      select: this.progressDetailSelect,
    });
    if (!row) {
      throw new NotFoundException('گزارش یافت نشد');
    }
    return this.mapProgress(row);
  }

  async createProgress(userId: string | undefined, dto: CreateProgressReportDto) {
    const actor = await this.access.actor(userId);
    const contractorId = this.access.contractorId(actor);
    await this.access.assertAssignedProject(contractorId, dto.projectId);
    const attachments = await buildStakeholderAttachments(
      this.prisma,
      dto.imageIds,
      dto.fileIds,
    );
    assertReportContent({
      progressPercent: dto.progressPercent,
      actionsDone: dto.actionsDone,
      nextPlan: dto.nextPlan,
      blockers: dto.blockers,
      needs: dto.needs,
      attachmentCount: attachments.length,
    });
    const created = await this.prisma.stakeholderProgressReport.create({
      data: {
        projectId: dto.projectId,
        contractorId,
        createdById: actor.id,
        occurredAt: parseOptionalIsoDate(dto.occurredAt)!,
        progressPercent: dto.progressPercent ?? null,
        actionsDone: blankToNull(dto.actionsDone),
        nextPlan: blankToNull(dto.nextPlan),
        blockers: blankToNull(dto.blockers),
        needs: blankToNull(dto.needs),
        attachments: attachments.length ? { create: attachments } : undefined,
      },
      select: { id: true },
    });
    return this.findProgress(userId, created.id);
  }

  async updateProgress(userId: string | undefined, id: string, dto: UpdateProgressReportDto) {
    const actor = await this.access.actor(userId);
    const contractorId = this.access.contractorId(actor);
    const current = await this.prisma.stakeholderProgressReport.findFirst({
      where: { id, contractorId },
      select: {
        id: true,
        projectId: true,
        progressPercent: true,
        actionsDone: true,
        nextPlan: true,
        blockers: true,
        needs: true,
        _count: { select: { attachments: true } },
      },
    });
    if (!current) {
      throw new NotFoundException('گزارش یافت نشد');
    }
    if (dto.projectId && dto.projectId !== current.projectId) {
      await this.access.assertAssignedProject(contractorId, dto.projectId);
    }
    const attachments =
      dto.imageIds !== undefined || dto.fileIds !== undefined
        ? await buildStakeholderAttachments(this.prisma, dto.imageIds, dto.fileIds)
        : undefined;
    assertReportContent({
      progressPercent:
        dto.progressPercent !== undefined ? dto.progressPercent : current.progressPercent,
      actionsDone: dto.actionsDone !== undefined ? dto.actionsDone : current.actionsDone,
      nextPlan: dto.nextPlan !== undefined ? dto.nextPlan : current.nextPlan,
      blockers: dto.blockers !== undefined ? dto.blockers : current.blockers,
      needs: dto.needs !== undefined ? dto.needs : current.needs,
      attachmentCount: attachments ? attachments.length : current._count.attachments,
    });
    await this.prisma.stakeholderProgressReport.update({
      where: { id },
      data: {
        projectId: dto.projectId,
        occurredAt:
          dto.occurredAt === undefined ? undefined : parseOptionalIsoDate(dto.occurredAt)!,
        progressPercent: dto.progressPercent,
        actionsDone: dto.actionsDone === undefined ? undefined : blankToNull(dto.actionsDone),
        nextPlan: dto.nextPlan === undefined ? undefined : blankToNull(dto.nextPlan),
        blockers: dto.blockers === undefined ? undefined : blankToNull(dto.blockers),
        needs: dto.needs === undefined ? undefined : blankToNull(dto.needs),
        attachments: attachments ? { deleteMany: {}, create: attachments } : undefined,
      },
    });
    return this.findProgress(userId, id);
  }

  async removeProgress(userId: string | undefined, id: string) {
    const actor = await this.access.actor(userId);
    const contractorId = this.access.contractorId(actor);
    const current = await this.prisma.stakeholderProgressReport.findFirst({
      where: { id, contractorId },
      select: { id: true },
    });
    if (!current) {
      throw new NotFoundException('گزارش یافت نشد');
    }
    await this.prisma.stakeholderProgressReport.delete({ where: { id } });
    return { ok: true };
  }

  async listCorrespondences(
    userId: string | undefined,
    query: FindCorrespondencesQueryDto,
  ) {
    const actor = await this.access.actor(userId);
    const { page, pageSize, skip, take } = paginationArgs(query);
    const where = this.correspondenceWhere(actor.contractorId, query);
    const orderBy = resolveSortOrder<Prisma.StakeholderCorrespondenceOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        subject: (dir) => ({ subject: dir }),
        kind: (dir) => ({ kind: dir }),
        status: (dir) => ({ status: dir }),
        project: (dir) => ({ project: { systemName: dir } }),
        contractor: (dir) => ({ contractor: { name: dir } }),
        dueDate: (dir) => ({ dueDate: dir }),
        createdAt: (dir) => ({ createdAt: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const [items, total] = await this.prisma.$transaction([
      this.prisma.stakeholderCorrespondence.findMany({
        where,
        orderBy,
        skip,
        take,
        select: this.correspondenceListSelect,
      }),
      this.prisma.stakeholderCorrespondence.count({ where }),
    ]);
    return paginatedResult(
      items.map((item) => this.mapCorrespondence(item)),
      total,
      page,
      pageSize,
    );
  }

  async findCorrespondence(userId: string | undefined, id: string) {
    const actor = await this.access.actor(userId);
    const row = await this.prisma.stakeholderCorrespondence.findFirst({
      where: { id, ...this.access.contractorWhere(actor) },
      select: this.correspondenceDetailSelect,
    });
    if (!row) {
      throw new NotFoundException('مکاتبه یافت نشد');
    }
    return this.mapCorrespondence(row);
  }

  async createCorrespondence(userId: string | undefined, dto: CreateCorrespondenceDto) {
    const actor = await this.access.actor(userId);
    const contractorId = this.access.contractorId(actor);
    if (dto.projectId) {
      await this.access.assertAssignedProject(contractorId, dto.projectId);
    }
    const attachments = await buildStakeholderAttachments(
      this.prisma,
      dto.imageIds,
      dto.fileIds,
    );
    const created = await this.prisma.stakeholderCorrespondence.create({
      data: {
        contractorId,
        projectId: dto.projectId ?? null,
        kind: dto.kind,
        subject: dto.subject.trim(),
        body: dto.body.trim(),
        dueDate: dto.kind === 'ACTION_REQUEST' ? parseOptionalIsoDate(dto.dueDate) ?? null : null,
        createdById: actor.id,
        attachments: attachments.length ? { create: attachments } : undefined,
      },
      select: { id: true },
    });
    return this.findCorrespondence(userId, created.id);
  }

  async updateCorrespondence(
    userId: string | undefined,
    id: string,
    dto: UpdateCorrespondenceDto,
  ) {
    const actor = await this.access.actor(userId);
    const contractorId = this.access.contractorId(actor);
    const current = await this.prisma.stakeholderCorrespondence.findFirst({
      where: { id, contractorId },
      select: {
        id: true,
        kind: true,
        status: true,
        projectId: true,
        messages: { where: { side: 'ORGANIZATION' }, select: { id: true }, take: 1 },
      },
    });
    if (!current) {
      throw new NotFoundException('مکاتبه یافت نشد');
    }
    if (current.status !== 'SENT' || current.messages.length > 0) {
      throw new ForbiddenException('بعد از رسیدگی سازمان، متن مکاتبه قابل ویرایش نیست');
    }
    const projectId = dto.projectId === undefined ? current.projectId : dto.projectId;
    if (projectId) {
      await this.access.assertAssignedProject(contractorId, projectId);
    }
    const kind = dto.kind ?? current.kind;
    const attachments =
      dto.imageIds !== undefined || dto.fileIds !== undefined
        ? await buildStakeholderAttachments(this.prisma, dto.imageIds, dto.fileIds)
        : undefined;
    await this.prisma.stakeholderCorrespondence.update({
      where: { id },
      data: {
        kind: dto.kind,
        subject: dto.subject?.trim(),
        body: dto.body?.trim(),
        projectId: dto.projectId,
        dueDate:
          kind === 'ACTION_REQUEST'
            ? dto.dueDate === undefined
              ? undefined
              : parseOptionalIsoDate(dto.dueDate) ?? null
            : null,
        actionResult: kind === 'ACTION_REQUEST' ? undefined : null,
        attachments: attachments ? { deleteMany: {}, create: attachments } : undefined,
      },
    });
    return this.findCorrespondence(userId, id);
  }

  async removeCorrespondence(userId: string | undefined, id: string) {
    const actor = await this.access.actor(userId);
    const contractorId = this.access.contractorId(actor);
    const current = await this.prisma.stakeholderCorrespondence.findFirst({
      where: { id, contractorId },
      select: {
        id: true,
        status: true,
        messages: { where: { side: 'ORGANIZATION' }, select: { id: true }, take: 1 },
      },
    });
    if (!current) {
      throw new NotFoundException('مکاتبه یافت نشد');
    }
    if (current.status !== 'SENT' || current.messages.length > 0) {
      throw new ForbiddenException('بعد از رسیدگی سازمان، مکاتبه قابل حذف نیست');
    }
    await this.prisma.stakeholderCorrespondence.delete({ where: { id } });
    return { ok: true };
  }

  async addMessage(
    userId: string | undefined,
    id: string,
    dto: CreateStakeholderMessageDto,
    side: 'CONTRACTOR' | 'ORGANIZATION',
  ) {
    const actor = await this.access.actor(userId);
    if (side === 'CONTRACTOR') {
      this.access.contractorId(actor);
    } else if (actor.contractorId) {
      throw new ForbiddenException('پاسخ سازمان از حساب پیمانکار ثبت نمی‌شود');
    }
    const current = await this.prisma.stakeholderCorrespondence.findFirst({
      where: { id, ...this.access.contractorWhere(actor) },
      select: { id: true, status: true },
    });
    if (!current) {
      throw new NotFoundException('مکاتبه یافت نشد');
    }
    if (current.status === 'CLOSED') {
      throw new ForbiddenException('مکاتبه بسته شده است');
    }
    await this.prisma.stakeholderMessage.create({
      data: {
        correspondenceId: id,
        authorId: actor.id,
        side,
        body: dto.body.trim(),
      },
    });
    if (
      side === 'ORGANIZATION' &&
      (current.status === 'SENT' || current.status === 'IN_REVIEW')
    ) {
      await this.prisma.stakeholderCorrespondence.update({
        where: { id },
        data: { status: 'ANSWERED' },
      });
    }
    return this.findCorrespondence(userId, id);
  }

  async updateWorkflow(
    userId: string | undefined,
    id: string,
    dto: UpdateCorrespondenceWorkflowDto,
  ) {
    const actor = await this.access.actor(userId);
    if (actor.contractorId) {
      throw new ForbiddenException('تغییر وضعیت فقط برای سازمان است');
    }
    if (dto.status == null && dto.actionResult === undefined) {
      throw new BadRequestException('وضعیت یا نتیجه را مشخص کنید');
    }
    const current = await this.prisma.stakeholderCorrespondence.findUnique({
      where: { id },
      select: { id: true, kind: true },
    });
    if (!current) {
      throw new NotFoundException('مکاتبه یافت نشد');
    }
    await this.prisma.stakeholderCorrespondence.update({
      where: { id },
      data: {
        status: dto.status,
        actionResult:
          current.kind === 'ACTION_REQUEST'
            ? dto.actionResult
            : dto.actionResult === undefined
              ? undefined
              : null,
      },
    });
    return this.findCorrespondence(userId, id);
  }

  private async assignedProjectIds(contractorId: string) {
    const contractor = await this.prisma.projectContractor.findUnique({
      where: { id: contractorId },
      select: {
        projectId: true,
        projectLinks: { select: { projectId: true } },
      },
    });
    if (!contractor) {
      return [];
    }
    return [...new Set([contractor.projectId, ...contractor.projectLinks.map((item) => item.projectId)])];
  }

  private progressWhere(
    contractorId: string | null,
    query: FindProgressReportsQueryDto,
  ): Prisma.StakeholderProgressReportWhereInput {
    const q = query.q?.trim();
    return {
      ...(contractorId ? { contractorId } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(!contractorId && query.contractorId ? { contractorId: query.contractorId } : {}),
      ...(q
        ? {
            OR: [
              { actionsDone: containsInsensitive(q) },
              { nextPlan: containsInsensitive(q) },
              { blockers: containsInsensitive(q) },
              { needs: containsInsensitive(q) },
              { project: { systemName: containsInsensitive(q) } },
              { project: { code: containsInsensitive(q) } },
              { contractor: { name: containsInsensitive(q) } },
            ],
          }
        : {}),
    };
  }

  private correspondenceWhere(
    contractorId: string | null,
    query: FindCorrespondencesQueryDto,
  ): Prisma.StakeholderCorrespondenceWhereInput {
    const q = query.q?.trim();
    return {
      ...(contractorId ? { contractorId } : {}),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(!contractorId && query.contractorId ? { contractorId: query.contractorId } : {}),
      ...(q
        ? {
            OR: [
              { subject: containsInsensitive(q) },
              { body: containsInsensitive(q) },
              { project: { systemName: containsInsensitive(q) } },
              { contractor: { name: containsInsensitive(q) } },
            ],
          }
        : {}),
    };
  }

  private progressListSelect = {
    id: true,
    occurredAt: true,
    progressPercent: true,
    actionsDone: true,
    nextPlan: true,
    blockers: true,
    needs: true,
    createdAt: true,
    updatedAt: true,
    project: { select: { id: true, systemName: true, code: true } },
    contractor: { select: { id: true, name: true } },
    createdBy: { select: personSelect },
    _count: { select: { attachments: true } },
  } satisfies Prisma.StakeholderProgressReportSelect;

  private progressDetailSelect = {
    ...this.progressListSelect,
    attachments: attachmentInclude,
  } satisfies Prisma.StakeholderProgressReportSelect;

  private correspondenceListSelect = {
    id: true,
    kind: true,
    status: true,
    subject: true,
    body: true,
    dueDate: true,
    actionResult: true,
    createdAt: true,
    updatedAt: true,
    project: { select: { id: true, systemName: true, code: true } },
    contractor: { select: { id: true, name: true } },
    createdBy: { select: personSelect },
    _count: { select: { messages: true, attachments: true } },
  } satisfies Prisma.StakeholderCorrespondenceSelect;

  private correspondenceDetailSelect = {
    ...this.correspondenceListSelect,
    attachments: attachmentInclude,
    messages: {
      orderBy: { createdAt: 'asc' as const },
      select: {
        id: true,
        side: true,
        body: true,
        createdAt: true,
        author: { select: personSelect },
      },
    },
  } satisfies Prisma.StakeholderCorrespondenceSelect;

  private mapProgress<T extends { occurredAt: Date }>(row: T) {
    return { ...row, occurredAt: toIsoDateOnly(row.occurredAt) };
  }

  private mapCorrespondence<T extends { dueDate: Date | null }>(row: T) {
    return { ...row, dueDate: toIsoDateOnly(row.dueDate) };
  }
}
