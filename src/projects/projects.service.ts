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
import { CreateProjectDto } from './dto/create-project.dto';
import { FindProjectsQueryDto } from './dto/find-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const projectSelect = {
  id: true,
  vicePresidency: true,
  management: true,
  unit: true,
  systemName: true,
  code: true,
  isActive: true,
  status: true,
  progressPercent: true,
  startDate: true,
  endDate: true,
  latitude: true,
  longitude: true,
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
  _count: { select: { contractors: true, phases: true } },
} satisfies Prisma.ProjectSelect;

function toCoord(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value);
}

function toDecimal(value: number | null | undefined) {
  if (value === undefined) {
    return undefined;
  }
  return value == null ? null : new Prisma.Decimal(value);
}

function activitySource(entry: {
  body: string | null;
  summary: string | null;
  transcript: string | null;
}) {
  const body = entry.body?.trim() ?? '';
  const summary = entry.summary?.trim() ?? '';
  const transcript = entry.transcript?.trim() ?? '';
  const text = body || summary || transcript;
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = lines[0] ?? '';
  const rest = lines.slice(1).join(' ');
  const excerpt = rest && rest !== title ? rest : summary && summary !== title ? summary : '';
  return { title, excerpt };
}

function serializeProject<
  T extends {
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
    startDate: Date | null;
    endDate: Date | null;
  },
>(item: T) {
  return {
    ...item,
    latitude: toCoord(item.latitude),
    longitude: toCoord(item.longitude),
    startDate: toIsoDateOnly(item.startDate),
    endDate: toIsoDateOnly(item.endDate),
  };
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindProjectsQueryDto) {
    const where = this.listWhere(query);
    const orderBy = this.orderBy(query);
    if (!wantsPagination(query)) {
      const items = await this.prisma.project.findMany({
        where,
        orderBy,
        select: projectSelect,
      });
      return items.map(serializeProject);
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
    return paginatedResult(items.map(serializeProject), total, page, pageSize);
  }

  async liveBoard(query: FindProjectsQueryDto) {
    const where = this.listWhere(query);
    const orderBy = this.orderBy(query);
    const items = await this.prisma.project.findMany({
      where,
      orderBy,
      select: {
        ...projectSelect,
        _count: {
          select: { contractors: true, phases: true, progressEntries: true },
        },
        contractors: {
          select: { id: true, name: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
        progressEntries: {
          select: {
            id: true,
            occurredAt: true,
            body: true,
            summary: true,
            transcript: true,
          },
          orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
          take: 1,
        },
      },
    });

    const byStatus: Record<string, number> = {
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      SUSPENDED: 0,
      COMPLETED: 0,
      unset: 0,
    };
    let withLocation = 0;
    let progressTotal = 0;
    let progressCount = 0;

    const serialized = items.map((item) => {
      const { contractors, progressEntries, ...rest } = item;
      if (rest.status) {
        byStatus[rest.status] += 1;
      } else {
        byStatus.unset += 1;
      }
      if (rest.latitude != null && rest.longitude != null) {
        withLocation += 1;
      }
      if (rest.progressPercent != null) {
        progressTotal += rest.progressPercent;
        progressCount += 1;
      }
      const last = progressEntries[0] ?? null;
      const source = last ? activitySource(last) : null;
      return {
        ...serializeProject(rest),
        mainContractor: contractors[0] ?? null,
        contractors,
        activityCount: rest._count.progressEntries,
        lastActivity: last
          ? {
              id: last.id,
              occurredAt: toIsoDateOnly(last.occurredAt),
              title: source?.title ?? '',
              excerpt: source?.excerpt ?? '',
            }
          : null,
      };
    });

    return {
      items: serialized,
      stats: {
        total: items.length,
        withLocation,
        withoutLocation: items.length - withLocation,
        avgProgressPercent:
          progressCount > 0
            ? Math.round((progressTotal / progressCount) * 10) / 10
            : null,
        byStatus: [
          { key: 'NOT_STARTED', count: byStatus.NOT_STARTED },
          { key: 'IN_PROGRESS', count: byStatus.IN_PROGRESS },
          { key: 'SUSPENDED', count: byStatus.SUSPENDED },
          { key: 'COMPLETED', count: byStatus.COMPLETED },
          { key: 'unset', count: byStatus.unset },
        ],
      },
    };
  }

  async lookups(query: FindProjectsQueryDto) {
    const [vicePresidencies, managements, units, companies] = await Promise.all([
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
      this.prisma.project.findMany({
        where: { companyName: { not: null } },
        distinct: ['companyName'],
        select: { companyName: true },
        orderBy: { companyName: 'asc' },
      }),
    ]);
    return {
      vicePresidencies: vicePresidencies.map((item) => item.vicePresidency),
      managements: managements.map((item) => item.management),
      units: units.map((item) => item.unit),
      companies: companies
        .map((item) => item.companyName)
        .filter((item): item is string => Boolean(item)),
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
    return serializeProject(project);
  }

  async create(dto: CreateProjectDto) {
    this.assertTimeline(dto.startDate, dto.endDate);
    this.assertCoordinates(dto.latitude, dto.longitude);
    await this.assertReplacement(dto.replacementProjectId);
    await this.assertUniqueCode(dto.code);
    const project = await this.prisma.project.create({
      data: this.createData(dto),
      select: projectSelect,
    });
    return serializeProject(project);
  }

  async update(id: string, dto: UpdateProjectDto) {
    const current = await this.findOne(id);
    this.assertTimeline(dto.startDate, dto.endDate);
    this.assertCoordinates(dto.latitude, dto.longitude);
    if (dto.replacementProjectId === id) {
      throw new BadRequestException('سامانه جایگزین نمی‌تواند همین پروژه باشد');
    }
    await this.assertReplacement(dto.replacementProjectId);
    if (dto.code !== undefined) {
      await this.assertUniqueCode(dto.code, id);
    }
    const data = this.updateData(dto);
    if (
      dto.progressPercent !== undefined &&
      dto.progressPercent !== current.progressPercent
    ) {
      data.status = 'IN_PROGRESS';
    }
    const project = await this.prisma.project.update({
      where: { id },
      data,
      select: projectSelect,
    });
    return serializeProject(project);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.project.delete({ where: { id } });
    return { ok: true };
  }

  listWhere(query: FindProjectsQueryDto): Prisma.ProjectWhereInput {
    return {
      vicePresidency: query.vicePresidency,
      management: query.management,
      unit: query.unit,
      companyName: query.companyName,
      isActive: query.isActive,
      status: query.status,
      isSupportActive: query.isSupportActive,
      importance: query.importance,
      id: query.excludeId ? { not: query.excludeId } : undefined,
      OR: query.q
        ? [
            { systemName: containsInsensitive(query.q) },
            { code: containsInsensitive(query.q) },
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
        code: (dir) => ({ code: dir }),
        isActive: (dir) => ({ isActive: dir }),
        status: (dir) => ({ status: dir }),
        progressPercent: (dir) => ({ progressPercent: dir }),
        startDate: (dir) => ({ startDate: dir }),
        endDate: (dir) => ({ endDate: dir }),
        companyName: (dir) => ({ companyName: dir }),
        systemUrl: (dir) => ({ systemUrl: dir }),
        launchYear: (dir) => ({ launchYear: dir }),
        isSupportActive: (dir) => ({ isSupportActive: dir }),
        replacement: (dir) => ({
          replacementProject: { systemName: dir },
        }),
        importance: (dir) => ({ importance: dir }),
        activityCount: (dir) => ({ progressEntries: { _count: dir } }),
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
      code: dto.code,
      isActive: dto.isActive,
      status: dto.status ?? 'NOT_STARTED',
      progressPercent: dto.progressPercent,
      startDate: dto.startDate ? parseIsoDate(dto.startDate) : null,
      endDate: dto.endDate ? parseIsoDate(dto.endDate) : null,
      latitude: toDecimal(dto.latitude ?? null),
      longitude: toDecimal(dto.longitude ?? null),
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
      code: dto.code,
      isActive: dto.isActive,
      status: dto.status,
      progressPercent: dto.progressPercent,
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
      latitude: toDecimal(dto.latitude),
      longitude: toDecimal(dto.longitude),
      companyName: dto.companyName,
      systemUrl: dto.systemUrl,
      launchYear: dto.launchYear,
      isSupportActive: dto.isSupportActive,
      replacementProjectId: dto.replacementProjectId,
      description: dto.description,
      importance: dto.importance,
    };
  }

  private assertTimeline(startDate?: string | null, endDate?: string | null) {
    if (startDate && endDate && endDate < startDate) {
      throw new BadRequestException('تاریخ پایان نباید قبل از تاریخ شروع باشد');
    }
  }

  private assertCoordinates(latitude?: number | null, longitude?: number | null) {
    if ((latitude == null) !== (longitude == null)) {
      throw new BadRequestException('موقعیت مکانی باید هر دو مختصات را داشته باشد');
    }
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

  private async assertUniqueCode(code: string, excludeId?: string) {
    const existing = await this.prisma.project.findFirst({
      where: {
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException('کد پروژه تکراری است');
    }
  }
}
