import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectChecklistItemDto } from './dto/create-project-checklist-item.dto';
import { FindProjectChecklistQueryDto } from './dto/find-project-checklist-query.dto';
import { UpdateProjectChecklistItemDto } from './dto/update-project-checklist-item.dto';

const itemSelect = {
  id: true,
  projectId: true,
  phaseId: true,
  title: true,
  weightPercent: true,
  isDone: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  project: {
    select: {
      id: true,
      systemName: true,
      progressMode: true,
      progressPercent: true,
    },
  },
  phase: {
    select: { id: true, name: true },
  },
} satisfies Prisma.ProjectChecklistItemSelect;

type WeightRow = { weightPercent: number; isDone: boolean };

function doneWeight(items: WeightRow[]) {
  return items.reduce(
    (sum, item) => sum + (item.isDone ? item.weightPercent : 0),
    0,
  );
}

function statusAfterChecklistProgress(
  progressPercent: number,
  currentStatus: string,
) {
  if (progressPercent >= 100) return 'COMPLETED' as const;
  if (currentStatus === 'COMPLETED') return 'IN_PROGRESS' as const;
  return undefined;
}

@Injectable()
export class ProjectChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    projectId: string,
    phaseId: string | null,
    query: FindProjectChecklistQueryDto,
  ) {
    await this.assertScope(projectId, phaseId);
    const where = this.listWhere(projectId, phaseId, query);
    const orderBy = resolveSortOrder<Prisma.ProjectChecklistItemOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        title: (dir) => ({ title: dir }),
        weightPercent: (dir) => ({ weightPercent: dir }),
        isDone: (dir) => ({ isDone: dir }),
      },
      [{ sortOrder: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.projectChecklistItem.findMany({
        where,
        orderBy,
        select: itemSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.projectChecklistItem.findMany({
        where,
        orderBy,
        skip,
        take,
        select: itemSelect,
      }),
      this.prisma.projectChecklistItem.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async summary(projectId: string, phaseId: string | null) {
    const project = await this.assertScope(projectId, phaseId);
    const [scopeItems, poolItems] = await Promise.all([
      this.prisma.projectChecklistItem.findMany({
        where: { projectId, phaseId },
        select: { weightPercent: true, isDone: true },
      }),
      this.prisma.projectChecklistItem.findMany({
        where: this.poolWhere(projectId, phaseId),
        select: { weightPercent: true },
      }),
    ]);
    const allocatedWeight = scopeItems.reduce(
      (sum, item) => sum + item.weightPercent,
      0,
    );
    const poolWeight = poolItems.reduce(
      (sum, item) => sum + item.weightPercent,
      0,
    );
    const drivesProgress = phaseId
      ? project.progressMode === 'PHASE_CHECKLIST'
      : project.progressMode === 'PROJECT_CHECKLIST';
    return {
      allocatedWeight,
      doneWeight: doneWeight(scopeItems),
      remainingWeight: Math.max(0, 100 - poolWeight),
      progressMode: project.progressMode,
      drivesProgress,
    };
  }

  async findOne(projectId: string, phaseId: string | null, id: string) {
    await this.assertScope(projectId, phaseId);
    const item = await this.prisma.projectChecklistItem.findFirst({
      where: { id, projectId, phaseId },
      select: itemSelect,
    });
    if (!item) {
      throw new NotFoundException('آیتم چک‌لیست یافت نشد');
    }
    return item;
  }

  async create(
    projectId: string,
    phaseId: string | null,
    dto: CreateProjectChecklistItemDto,
  ) {
    await this.assertScope(projectId, phaseId);
    await this.assertWeightBudget(projectId, phaseId, dto.weightPercent);
    const last = await this.prisma.projectChecklistItem.aggregate({
      where: { projectId, phaseId },
      _max: { sortOrder: true },
    });
    const item = await this.prisma.projectChecklistItem.create({
      data: {
        projectId,
        phaseId,
        title: dto.title,
        weightPercent: dto.weightPercent,
        isDone: dto.isDone ?? false,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
      select: itemSelect,
    });
    await this.recompute(projectId);
    return item;
  }

  async update(
    projectId: string,
    phaseId: string | null,
    id: string,
    dto: UpdateProjectChecklistItemDto,
  ) {
    const current = await this.findOne(projectId, phaseId, id);
    if (dto.weightPercent !== undefined) {
      await this.assertWeightBudget(
        projectId,
        phaseId,
        dto.weightPercent,
        id,
      );
    }
    const item = await this.prisma.projectChecklistItem.update({
      where: { id: current.id },
      data: {
        title: dto.title,
        weightPercent: dto.weightPercent,
        isDone: dto.isDone,
      },
      select: itemSelect,
    });
    await this.recompute(projectId);
    return item;
  }

  async remove(projectId: string, phaseId: string | null, id: string) {
    await this.findOne(projectId, phaseId, id);
    await this.prisma.projectChecklistItem.delete({ where: { id } });
    await this.recompute(projectId);
    return { ok: true };
  }

  async recompute(projectId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { progressMode: true, status: true },
    });
    if (!project || project.progressMode === 'MANUAL') {
      return;
    }

    if (project.progressMode === 'PROJECT_CHECKLIST') {
      const items = await db.projectChecklistItem.findMany({
        where: { projectId, phaseId: null },
        select: { weightPercent: true, isDone: true },
      });
      const progressPercent = doneWeight(items);
      await db.project.update({
        where: { id: projectId },
        data: {
          progressPercent,
          status: statusAfterChecklistProgress(progressPercent, project.status),
        },
      });
      return;
    }

    const [items, phases] = await Promise.all([
      db.projectChecklistItem.findMany({
        where: { projectId, phaseId: { not: null } },
        select: { phaseId: true, weightPercent: true, isDone: true },
      }),
      db.projectPhase.findMany({
        where: { projectId },
        select: { id: true },
      }),
    ]);
    const buckets = new Map<string, { done: number; total: number }>();
    let projectDone = 0;
    for (const item of items) {
      if (!item.phaseId) continue;
      const bucket = buckets.get(item.phaseId) ?? { done: 0, total: 0 };
      bucket.total += item.weightPercent;
      if (item.isDone) {
        bucket.done += item.weightPercent;
        projectDone += item.weightPercent;
      }
      buckets.set(item.phaseId, bucket);
    }
    await db.project.update({
      where: { id: projectId },
      data: {
        progressPercent: projectDone,
        status: statusAfterChecklistProgress(projectDone, project.status),
      },
    });
    for (const phase of phases) {
      const bucket = buckets.get(phase.id);
      await db.projectPhase.update({
        where: { id: phase.id },
        data: {
          progressPercent:
            bucket && bucket.total > 0
              ? Math.round((bucket.done / bucket.total) * 100)
              : null,
        },
      });
    }
  }

  private listWhere(
    projectId: string,
    phaseId: string | null,
    query: FindProjectChecklistQueryDto,
  ): Prisma.ProjectChecklistItemWhereInput {
    return {
      projectId,
      phaseId,
      isDone: query.isDone,
      title: query.q ? containsInsensitive(query.q) : undefined,
    };
  }

  private poolWhere(
    projectId: string,
    phaseId: string | null,
    excludeId?: string,
  ): Prisma.ProjectChecklistItemWhereInput {
    return {
      projectId,
      phaseId: phaseId ? { not: null } : null,
      id: excludeId ? { not: excludeId } : undefined,
    };
  }

  private async assertWeightBudget(
    projectId: string,
    phaseId: string | null,
    weightPercent: number,
    excludeId?: string,
  ) {
    const used = await this.prisma.projectChecklistItem.aggregate({
      where: this.poolWhere(projectId, phaseId, excludeId),
      _sum: { weightPercent: true },
    });
    const allocated = used._sum.weightPercent ?? 0;
    if (allocated + weightPercent > 100) {
      const remaining = Math.max(0, 100 - allocated);
      throw new BadRequestException(
        `مجموع وزن‌ها نمی‌تواند بیشتر از ۱۰۰ باشد. وزن باقی‌مانده: ${remaining}`,
      );
    }
  }

  private async assertScope(projectId: string, phaseId: string | null) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, progressMode: true },
    });
    if (!project) {
      throw new NotFoundException('پروژه یافت نشد');
    }
    if (!phaseId) {
      return project;
    }
    const phase = await this.prisma.projectPhase.findFirst({
      where: { id: phaseId, projectId },
      select: { id: true },
    });
    if (!phase) {
      throw new NotFoundException('فاز یافت نشد');
    }
    return project;
  }
}
