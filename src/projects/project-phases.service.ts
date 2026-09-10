import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseIsoDate, toIsoDateOnly } from '../common/iso-date';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectPhaseDto } from './dto/create-project-phase.dto';
import { FindProjectPhasesQueryDto } from './dto/find-project-phases-query.dto';
import { UpdateProjectPhaseDto } from './dto/update-project-phase.dto';

const phaseSelect = {
  id: true,
  projectId: true,
  name: true,
  startDate: true,
  endDate: true,
  status: true,
  progressPercent: true,
  createdAt: true,
  updatedAt: true,
  project: {
    select: { id: true, systemName: true },
  },
} satisfies Prisma.ProjectPhaseSelect;

function serializePhase<T extends { startDate: Date | null; endDate: Date | null }>(
  item: T,
) {
  return {
    ...item,
    startDate: toIsoDateOnly(item.startDate),
    endDate: toIsoDateOnly(item.endDate),
  };
}

@Injectable()
export class ProjectPhasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(projectId: string, query: FindProjectPhasesQueryDto) {
    await this.assertProject(projectId);
    const where: Prisma.ProjectPhaseWhereInput = {
      projectId,
      status: query.status,
      OR: query.q ? [{ name: containsInsensitive(query.q) }] : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.ProjectPhaseOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        startDate: (dir) => ({ startDate: dir }),
        endDate: (dir) => ({ endDate: dir }),
        status: (dir) => ({ status: dir }),
        progressPercent: (dir) => ({ progressPercent: dir }),
      },
      [{ startDate: 'asc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.projectPhase.findMany({
        where,
        orderBy,
        select: phaseSelect,
      });
      return items.map(serializePhase);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.projectPhase.findMany({
        where,
        orderBy,
        skip,
        take,
        select: phaseSelect,
      }),
      this.prisma.projectPhase.count({ where }),
    ]);
    return paginatedResult(items.map(serializePhase), total, page, pageSize);
  }

  async findOne(projectId: string, id: string) {
    await this.assertProject(projectId);
    const phase = await this.prisma.projectPhase.findFirst({
      where: { id, projectId },
      select: phaseSelect,
    });
    if (!phase) {
      throw new NotFoundException('فاز یافت نشد');
    }
    return serializePhase(phase);
  }

  async create(projectId: string, dto: CreateProjectPhaseDto) {
    await this.assertProject(projectId);
    this.assertTimeline(dto.startDate, dto.endDate);
    const phase = await this.prisma.projectPhase.create({
      data: {
        projectId,
        name: dto.name,
        startDate: dto.startDate ? parseIsoDate(dto.startDate) : null,
        endDate: dto.endDate ? parseIsoDate(dto.endDate) : null,
        status: dto.status,
        progressPercent: dto.progressPercent,
      },
      select: phaseSelect,
    });
    return serializePhase(phase);
  }

  async update(projectId: string, id: string, dto: UpdateProjectPhaseDto) {
    const current = await this.findOne(projectId, id);
    const startDate = dto.startDate === undefined ? current.startDate : dto.startDate;
    const endDate = dto.endDate === undefined ? current.endDate : dto.endDate;
    this.assertTimeline(startDate, endDate);
    const phase = await this.prisma.projectPhase.update({
      where: { id },
      data: {
        name: dto.name,
        startDate:
          dto.startDate === undefined
            ? undefined
            : dto.startDate
              ? parseIsoDate(dto.startDate)
              : null,
        endDate:
          dto.endDate === undefined
            ? undefined
            : dto.endDate
              ? parseIsoDate(dto.endDate)
              : null,
        status: dto.status,
        progressPercent: dto.progressPercent,
      },
      select: phaseSelect,
    });
    return serializePhase(phase);
  }

  async remove(projectId: string, id: string) {
    await this.findOne(projectId, id);
    await this.prisma.projectPhase.delete({ where: { id } });
    return { ok: true };
  }

  private assertTimeline(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException('تاریخ پایان نباید قبل از تاریخ شروع باشد');
    }
  }

  private async assertProject(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      throw new NotFoundException('پروژه یافت نشد');
    }
  }
}
