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
import {
  buildOrganizationUnitPaths,
  organizationUnitSubtreeIds,
} from '../organization/organization-unit-tree';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectDocumentsService } from './project-documents.service';
import { CreateProjectDto } from './dto/create-project.dto';
import {
  FindProjectsQueryDto,
  unspecifiedProjectFilter,
} from './dto/find-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const unitSelect = {
  id: true,
  name: true,
  parentId: true,
  kind: { select: { id: true, name: true } },
} satisfies Prisma.OrganizationUnitSelect;

const groupSelect = {
  id: true,
  name: true,
  color: true,
} satisfies Prisma.ProjectGroupSelect;

const operatorSelect = {
  organizationUnitId: true,
  organizationUnit: {
    select: {
      id: true,
      name: true,
      parentId: true,
      kind: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.ProjectOperatorSelect;

const projectSelect = {
  id: true,
  systemName: true,
  code: true,
  isActive: true,
  status: true,
  progressPercent: true,
  startDate: true,
  endDate: true,
  latitude: true,
  longitude: true,
  boundary: true,
  address: true,
  companyName: true,
  systemUrl: true,
  launchYear: true,
  isSupportActive: true,
  replacementProjectId: true,
  description: true,
  color: true,
  showOnLiveBoard: true,
  showOnHomePage: true,
  importance: true,
  orgUnitId: true,
  groupId: true,
  createdAt: true,
  updatedAt: true,
  replacementProject: {
    select: { id: true, systemName: true },
  },
  orgUnit: { select: unitSelect },
  group: { select: groupSelect },
  operators: {
    select: operatorSelect,
    orderBy: { organizationUnit: { name: 'asc' } },
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
  return { title, excerpt, text };
}

function serializeLiveBoardActivity(entry: {
  id: string;
  occurredAt: Date;
  body: string | null;
  summary: string | null;
  transcript: string | null;
}) {
  const source = activitySource(entry);
  return {
    id: entry.id,
    occurredAt: toIsoDateOnly(entry.occurredAt),
    title: source.title,
    excerpt: source.excerpt,
    text: source.text,
  };
}

function serializeProject<
  T extends {
    latitude: Prisma.Decimal | null;
    longitude: Prisma.Decimal | null;
    startDate: Date | null;
    endDate: Date | null;
    orgUnit?: {
      id: string;
      name: string;
      parentId: string | null;
      kind: { id: string; name: string };
    } | null;
    group?: { id: string; name: string; color: string | null } | null;
    operators?: Array<{
      organizationUnit: {
        id: string;
        name: string;
        parentId: string | null;
        kind: { id: string; name: string };
      };
    }>;
  },
>(item: T, paths: Map<string, string>) {
  const { operators = [], orgUnit, group, ...rest } = item;
  return {
    ...rest,
    latitude: toCoord(item.latitude),
    longitude: toCoord(item.longitude),
    startDate: toIsoDateOnly(item.startDate),
    endDate: toIsoDateOnly(item.endDate),
    orgUnit: orgUnit
      ? {
          ...orgUnit,
          pathLabel: paths.get(orgUnit.id) ?? orgUnit.name,
        }
      : null,
    group: group ?? null,
    operators: operators.map((link) => ({
      id: link.organizationUnit.id,
      name: link.organizationUnit.name,
      parentId: link.organizationUnit.parentId,
      kind: link.organizationUnit.kind,
      pathLabel: paths.get(link.organizationUnit.id) ?? link.organizationUnit.name,
    })),
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: ProjectDocumentsService,
  ) {}

  async findAll(query: FindProjectsQueryDto) {
    const where = await this.listWhere(query);
    const orderBy = this.orderBy(query);
    const paths = await this.unitPathMap();
    if (!wantsPagination(query)) {
      const items = await this.prisma.project.findMany({
        where,
        orderBy,
        select: projectSelect,
      });
      return items.map((item) => serializeProject(item, paths));
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
    return paginatedResult(
      items.map((item) => serializeProject(item, paths)),
      total,
      page,
      pageSize,
    );
  }

  async liveBoard(
    query: FindProjectsQueryDto,
    options?: { forHomePage?: boolean },
  ) {
    const where = await this.listWhere(query);
    const orderBy = this.orderBy(query);
    const paths = await this.unitPathMap();
    const visibility = options?.forHomePage
      ? { showOnHomePage: true }
      : { showOnLiveBoard: true };
    const items = await this.prisma.project.findMany({
      where: { AND: [where, visibility] },
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
          take: 3,
        },
      },
    });

    const byStatus = {
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
    };
    let progressTotal = 0;
    let progressCount = 0;
    let minProgressPercent: number | null = null;
    let maxProgressPercent: number | null = null;

    const serialized = items.map((item) => {
      const { contractors, progressEntries, ...rest } = item;
      if (rest.status === 'COMPLETED') {
        byStatus.COMPLETED += 1;
      } else if (rest.status === 'IN_PROGRESS' || rest.status === 'SUSPENDED') {
        byStatus.IN_PROGRESS += 1;
      } else {
        byStatus.NOT_STARTED += 1;
      }
      if (rest.progressPercent != null) {
        progressTotal += rest.progressPercent;
        progressCount += 1;
        if (minProgressPercent == null || rest.progressPercent < minProgressPercent) {
          minProgressPercent = rest.progressPercent;
        }
        if (maxProgressPercent == null || rest.progressPercent > maxProgressPercent) {
          maxProgressPercent = rest.progressPercent;
        }
      }
      const recentActivities = progressEntries.map(serializeLiveBoardActivity);
      return {
        ...serializeProject(rest, paths),
        mainContractor: contractors[0] ?? null,
        contractors,
        activityCount: rest._count.progressEntries,
        recentActivities,
        lastActivity: recentActivities[0] ?? null,
      };
    });

    return {
      items: serialized,
      stats: {
        total: items.length,
        avgProgressPercent:
          progressCount > 0
            ? Math.round((progressTotal / progressCount) * 10) / 10
            : null,
        maxProgressPercent,
        minProgressPercent,
        byStatus: [
          { key: 'NOT_STARTED', count: byStatus.NOT_STARTED },
          { key: 'IN_PROGRESS', count: byStatus.IN_PROGRESS },
          { key: 'COMPLETED', count: byStatus.COMPLETED },
        ],
      },
    };
  }

  async lookups() {
    const companies = await this.prisma.project.findMany({
      where: { companyName: { not: null } },
      distinct: ['companyName'],
      select: { companyName: true },
      orderBy: { companyName: 'asc' },
    });
    return {
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
    return serializeProject(project, await this.unitPathMap());
  }

  async create(dto: CreateProjectDto) {
    this.assertTimeline(dto.startDate, dto.endDate);
    this.assertCoordinates(dto.latitude, dto.longitude);
    await this.assertReplacement(dto.replacementProjectId);
    await this.assertUniqueCode(dto.code);
    await this.assertOwnerUnit(dto.orgUnitId);
    await this.assertGroup(dto.groupId);
    const operatorIds = await this.assertOperatorUnits(dto.operatorIds);
    const project = await this.prisma.project.create({
      data: this.createData(dto, operatorIds),
      select: projectSelect,
    });
    return serializeProject(project, await this.unitPathMap());
  }

  async update(id: string, dto: UpdateProjectDto) {
    const current = await this.findOne(id);
    this.assertTimeline(dto.startDate, dto.endDate);
    this.assertCoordinates(dto.latitude, dto.longitude);
    if (dto.replacementProjectId === id) {
      throw new BadRequestException('سامانه جایگزین نمی‌تواند همین پروژه باشد');
    }
    await this.assertReplacement(dto.replacementProjectId);
    await this.assertOwnerUnit(dto.orgUnitId);
    await this.assertGroup(dto.groupId);
    if (dto.code !== undefined) {
      await this.assertUniqueCode(dto.code, id);
    }
    const operatorIds =
      dto.operatorIds === undefined
        ? undefined
        : await this.assertOperatorUnits(dto.operatorIds);
    const data = this.updateData(dto);
    if (
      dto.progressPercent !== undefined &&
      dto.progressPercent !== current.progressPercent
    ) {
      data.status = 'IN_PROGRESS';
    }
    const project = await this.prisma.$transaction(async (tx) => {
      if (operatorIds) {
        await this.syncOperators(tx, id, operatorIds);
      }
      return tx.project.update({
        where: { id },
        data,
        select: projectSelect,
      });
    });
    return serializeProject(project, await this.unitPathMap());
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.project.delete({ where: { id } });
    await this.documents.removeProjectFiles(id);
    return { ok: true };
  }

  async listWhere(query: FindProjectsQueryDto): Promise<Prisma.ProjectWhereInput> {
    const operators = await this.operatorUnitFilter(query.operatorUnitId);
    const orgUnitId = await this.ownerUnitFilter(query.orgUnitId);
    return {
      companyName: query.companyName,
      isActive: query.isActive,
      status: query.status,
      isSupportActive: query.isSupportActive,
      importance: query.importance,
      id: query.excludeId ? { not: query.excludeId } : undefined,
      orgUnitId,
      groupId:
        query.groupId === unspecifiedProjectFilter ? null : query.groupId,
      operators,
      OR: query.q
        ? [
            { systemName: containsInsensitive(query.q) },
            { code: containsInsensitive(query.q) },
            { companyName: containsInsensitive(query.q) },
            { address: containsInsensitive(query.q) },
            { systemUrl: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
            { orgUnit: { name: containsInsensitive(query.q) } },
            { group: { name: containsInsensitive(query.q) } },
            {
              operators: {
                some: {
                  organizationUnit: { name: containsInsensitive(query.q) },
                },
              },
            },
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
        operators: (dir) => ({ operators: { _count: dir } }),
        orgUnit: (dir) => ({ orgUnit: { name: dir } }),
        group: (dir) => ({ group: { name: dir } }),
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

  private createData(
    dto: CreateProjectDto,
    operatorIds: string[],
  ): Prisma.ProjectUncheckedCreateInput {
    return {
      systemName: dto.systemName,
      code: dto.code,
      isActive: dto.isActive,
      status: dto.status ?? 'NOT_STARTED',
      progressPercent: dto.progressPercent,
      startDate: dto.startDate ? parseIsoDate(dto.startDate) : null,
      endDate: dto.endDate ? parseIsoDate(dto.endDate) : null,
      latitude: toDecimal(dto.latitude ?? null),
      longitude: toDecimal(dto.longitude ?? null),
      address: dto.address,
      companyName: dto.companyName,
      systemUrl: dto.systemUrl,
      launchYear: dto.launchYear,
      isSupportActive: dto.isSupportActive,
      replacementProjectId: dto.replacementProjectId,
      description: dto.description,
      color: dto.color ?? '#2ebdb6',
      showOnLiveBoard: dto.showOnLiveBoard ?? true,
      showOnHomePage: dto.showOnHomePage ?? true,
      importance: dto.importance,
      orgUnitId: dto.orgUnitId ?? null,
      groupId: dto.groupId ?? null,
      operators: {
        create: operatorIds.map((organizationUnitId) => ({ organizationUnitId })),
      },
    };
  }

  private updateData(dto: UpdateProjectDto): Prisma.ProjectUncheckedUpdateInput {
    return {
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
      address: dto.address,
      companyName: dto.companyName,
      systemUrl: dto.systemUrl,
      launchYear: dto.launchYear,
      isSupportActive: dto.isSupportActive,
      replacementProjectId: dto.replacementProjectId,
      description: dto.description,
      color: dto.color,
      showOnLiveBoard: dto.showOnLiveBoard,
      showOnHomePage: dto.showOnHomePage,
      importance: dto.importance,
      orgUnitId: dto.orgUnitId,
      groupId: dto.groupId,
    };
  }

  private async unitPathMap() {
    const units = await this.prisma.organizationUnit.findMany({
      select: { id: true, name: true, parentId: true },
    });
    return buildOrganizationUnitPaths(units);
  }

  private async ownerUnitFilter(
    orgUnitId?: string,
  ): Promise<Prisma.ProjectWhereInput['orgUnitId']> {
    if (!orgUnitId) {
      return undefined;
    }
    if (orgUnitId === unspecifiedProjectFilter) {
      return null;
    }
    const units = await this.prisma.organizationUnit.findMany({
      select: { id: true, parentId: true },
    });
    const ids = organizationUnitSubtreeIds(units, orgUnitId);
    return { in: ids };
  }

  private async operatorUnitFilter(
    operatorUnitId?: string,
  ): Promise<Prisma.ProjectOperatorListRelationFilter | undefined> {
    if (!operatorUnitId) {
      return undefined;
    }
    const units = await this.prisma.organizationUnit.findMany({
      select: { id: true, parentId: true },
    });
    const ids = organizationUnitSubtreeIds(units, operatorUnitId);
    return { some: { organizationUnitId: { in: ids } } };
  }

  private async assertOperatorUnits(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) {
      throw new BadRequestException('حداقل یک بهره‌بردار را انتخاب کنید');
    }
    const found = await this.prisma.organizationUnit.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (found.length !== unique.length) {
      throw new BadRequestException('بهره‌بردار انتخاب‌شده معتبر نیست');
    }
    return unique;
  }

  private async syncOperators(
    tx: Prisma.TransactionClient,
    projectId: string,
    operatorIds: string[],
  ) {
    await tx.projectOperator.deleteMany({
      where: { projectId, organizationUnitId: { notIn: operatorIds } },
    });
    await tx.projectOperator.createMany({
      data: operatorIds.map((organizationUnitId) => ({
        projectId,
        organizationUnitId,
      })),
      skipDuplicates: true,
    });
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

  private async assertOwnerUnit(id?: string | null) {
    if (id == null) {
      return;
    }
    const exists = await this.prisma.organizationUnit.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new BadRequestException('واحد سازمانی یافت نشد');
    }
  }

  private async assertGroup(id?: string | null) {
    if (id == null) {
      return;
    }
    const exists = await this.prisma.projectGroup.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new BadRequestException('گروه انتخاب‌شده معتبر نیست');
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
