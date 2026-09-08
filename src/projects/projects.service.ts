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
import { CreateProjectDto } from './dto/create-project.dto';
import { FindProjectsQueryDto } from './dto/find-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const projectSelect = {
  id: true,
  vicePresidency: true,
  management: true,
  unit: true,
  systemName: true,
  isActive: true,
  companyName: true,
  systemUrl: true,
  launchYear: true,
  isSupportActive: true,
  replacementProjectId: true,
  description: true,
  importance: true,
  createdAt: true,
  updatedAt: true,
  replacementProject: {
    select: { id: true, systemName: true },
  },
  _count: { select: { contractors: true } },
} satisfies Prisma.ProjectSelect;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindProjectsQueryDto) {
    const where = this.listWhere(query);
    const orderBy = this.orderBy(query);
    if (!wantsPagination(query)) {
      return this.prisma.project.findMany({
        where,
        orderBy,
        select: projectSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy,
        skip,
        take,
        select: projectSelect,
      }),
      this.prisma.project.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async lookups(query: FindProjectsQueryDto) {
    const [vicePresidencies, managements, units] = await Promise.all([
      this.prisma.project.findMany({
        distinct: ['vicePresidency'],
        select: { vicePresidency: true },
        orderBy: { vicePresidency: 'asc' },
      }),
      this.prisma.project.findMany({
        where: query.vicePresidency
          ? { vicePresidency: query.vicePresidency }
          : undefined,
        distinct: ['management'],
        select: { management: true },
        orderBy: { management: 'asc' },
      }),
      this.prisma.project.findMany({
        where: {
          ...(query.vicePresidency
            ? { vicePresidency: query.vicePresidency }
            : {}),
          ...(query.management ? { management: query.management } : {}),
        },
        distinct: ['unit'],
        select: { unit: true },
        orderBy: { unit: 'asc' },
      }),
    ]);
    return {
      vicePresidencies: vicePresidencies.map((item) => item.vicePresidency),
      managements: managements.map((item) => item.management),
      units: units.map((item) => item.unit),
    };
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: projectSelect,
    });
    if (!project) {
      throw new NotFoundException('پروژه یافت نشد');
    }
    return project;
  }

  async create(dto: CreateProjectDto) {
    await this.assertReplacement(dto.replacementProjectId);
    return this.prisma.project.create({
      data: this.createData(dto),
      select: projectSelect,
    });
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    if (dto.replacementProjectId === id) {
      throw new BadRequestException('سامانه جایگزین نمی‌تواند همین پروژه باشد');
    }
    await this.assertReplacement(dto.replacementProjectId);
    return this.prisma.project.update({
      where: { id },
      data: this.updateData(dto),
      select: projectSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.project.delete({ where: { id } });
    return { ok: true };
  }

  private listWhere(query: FindProjectsQueryDto): Prisma.ProjectWhereInput {
    return {
      vicePresidency: query.vicePresidency,
      management: query.management,
      unit: query.unit,
      isActive: query.isActive,
      isSupportActive: query.isSupportActive,
      importance: query.importance,
      id: query.excludeId ? { not: query.excludeId } : undefined,
      OR: query.q
        ? [
            { systemName: containsInsensitive(query.q) },
            { companyName: containsInsensitive(query.q) },
            { systemUrl: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
            { vicePresidency: containsInsensitive(query.q) },
            { management: containsInsensitive(query.q) },
            { unit: containsInsensitive(query.q) },
          ]
        : undefined,
    };
  }

  private orderBy(
    query: FindProjectsQueryDto,
  ): Prisma.ProjectOrderByWithRelationInput[] {
    return resolveSortOrder<Prisma.ProjectOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        vicePresidency: (dir) => ({ vicePresidency: dir }),
        management: (dir) => ({ management: dir }),
        unit: (dir) => ({ unit: dir }),
        systemName: (dir) => ({ systemName: dir }),
        isActive: (dir) => ({ isActive: dir }),
        companyName: (dir) => ({ companyName: dir }),
        systemUrl: (dir) => ({ systemUrl: dir }),
        launchYear: (dir) => ({ launchYear: dir }),
        isSupportActive: (dir) => ({ isSupportActive: dir }),
        replacement: (dir) => ({
          replacementProject: { systemName: dir },
        }),
        importance: (dir) => ({ importance: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
  }

  private createData(dto: CreateProjectDto): Prisma.ProjectUncheckedCreateInput {
    return {
      vicePresidency: dto.vicePresidency,
      management: dto.management,
      unit: dto.unit,
      systemName: dto.systemName,
      isActive: dto.isActive,
      companyName: dto.companyName,
      systemUrl: dto.systemUrl,
      launchYear: dto.launchYear,
      isSupportActive: dto.isSupportActive,
      replacementProjectId: dto.replacementProjectId,
      description: dto.description,
      importance: dto.importance,
    };
  }

  private updateData(dto: UpdateProjectDto): Prisma.ProjectUncheckedUpdateInput {
    return {
      vicePresidency: dto.vicePresidency,
      management: dto.management,
      unit: dto.unit,
      systemName: dto.systemName,
      isActive: dto.isActive,
      companyName: dto.companyName,
      systemUrl: dto.systemUrl,
      launchYear: dto.launchYear,
      isSupportActive: dto.isSupportActive,
      replacementProjectId: dto.replacementProjectId,
      description: dto.description,
      importance: dto.importance,
    };
  }

  private async assertReplacement(id?: string | null) {
    if (id == null) {
      return;
    }
    const exists = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new BadRequestException('سامانه جایگزین یافت نشد');
    }
  }
}
