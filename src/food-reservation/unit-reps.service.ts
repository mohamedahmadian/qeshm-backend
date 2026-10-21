import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { buildOrganizationUnitPaths } from '../organization/organization-unit-tree';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  CreateUnitRepPersonDto,
  CreateUnitRepUnitDto,
  UpdateUnitRepDto,
} from './dto/assign-unit-rep.dto';
import { FindUnitRepsQueryDto } from './dto/find-unit-reps-query.dto';

const unitRepSelect = {
  id: true,
  name: true,
  code: true,
  nutritionRepId: true,
  maxMeals: true,
  guestMealsEnabled: true,
  maxGuestMeals: true,
  kind: { select: { id: true, name: true } },
  nutritionRep: { select: { id: true, fullName: true, phone: true } },
} satisfies Prisma.OrganizationUnitSelect;

@Injectable()
export class UnitRepsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async findAll(query: FindUnitRepsQueryDto) {
    const where: Prisma.OrganizationUnitWhereInput = {
      OR: query.q
        ? [
            { name: containsInsensitive(query.q) },
            { code: containsInsensitive(query.q) },
            { kind: { name: containsInsensitive(query.q) } },
            { parent: { name: containsInsensitive(query.q) } },
            { nutritionRep: { fullName: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.OrganizationUnitOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        code: (dir) => ({ code: dir }),
        kind: (dir) => ({ kind: { name: dir } }),
        representative: (dir) => ({ nutritionRep: { fullName: dir } }),
        maxMeals: (dir) => ({ maxMeals: dir }),
        guestMealsEnabled: (dir) => ({ guestMealsEnabled: dir }),
        maxGuestMeals: (dir) => ({ maxGuestMeals: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total, paths] = await Promise.all([
      this.prisma.organizationUnit.findMany({
        where,
        orderBy,
        skip,
        take,
        select: unitRepSelect,
      }),
      this.prisma.organizationUnit.count({ where }),
      this.unitPaths(),
    ]);
    return paginatedResult(
      items.map((item) => this.withPath(item, paths)),
      total,
      page,
      pageSize,
    );
  }

  async findOne(unitId: string) {
    const unit = await this.prisma.organizationUnit.findUnique({
      where: { id: unitId },
      select: unitRepSelect,
    });
    if (!unit) {
      throw new NotFoundException('واحد سازمانی یافت نشد');
    }
    const paths = await this.unitPaths();
    return this.withPath(unit, paths);
  }

  async createUnit(dto: CreateUnitRepUnitDto) {
    await this.assertKind(dto.kindId);
    await this.assertUniqueCode(dto.code);
    if (dto.parentId) {
      await this.findOne(dto.parentId);
    }
    const unit = await this.prisma.organizationUnit.create({
      data: {
        name: dto.name,
        code: dto.code,
        kindId: dto.kindId,
        parentId: dto.parentId ?? null,
        ...this.mealLimits(dto),
      },
      select: unitRepSelect,
    });
    const paths = await this.unitPaths();
    return this.withPath(unit, paths);
  }

  async assign(unitId: string, nutritionRepId?: string | null, limits?: UpdateUnitRepDto) {
    await this.findOne(unitId);
    if (nutritionRepId) {
      await this.assertNutritionRep(unitId, nutritionRepId);
    }
    if (limits?.code) {
      await this.assertUniqueCode(limits.code, unitId);
    }
    const unit = await this.prisma.organizationUnit.update({
      where: { id: unitId },
      data: {
        nutritionRepId: nutritionRepId ?? null,
        ...(limits?.code ? { code: limits.code } : {}),
        ...this.mealLimits(limits),
      },
      select: unitRepSelect,
    });
    const paths = await this.unitPaths();
    return this.withPath(unit, paths);
  }

  async createPerson(unitId: string, dto: CreateUnitRepPersonDto) {
    await this.findOne(unitId);
    const user = await this.users.create({
      username: dto.phone,
      password: dto.phone,
      firstName: dto.firstName,
      lastName: dto.lastName,
      nationalId: dto.nationalId,
      phone: dto.phone,
      orgUnitId: unitId,
    });
    return this.assign(unitId, user.id);
  }

  async clear(unitId: string) {
    await this.findOne(unitId);
    await this.prisma.organizationUnit.update({
      where: { id: unitId },
      data: { nutritionRepId: null },
    });
    return { ok: true };
  }

  private async unitPaths() {
    const catalog = await this.prisma.organizationUnit.findMany({
      select: { id: true, name: true, parentId: true },
    });
    return buildOrganizationUnitPaths(catalog);
  }

  private withPath<T extends { id: string; name: string }>(
    item: T,
    paths: Map<string, string>,
  ) {
    return {
      ...item,
      pathLabel: paths.get(item.id) ?? item.name,
    };
  }

  private mealLimits(limits?: UpdateUnitRepDto) {
    if (!limits) return {};
    return {
      maxMeals: limits.maxMeals ?? 1,
      guestMealsEnabled: limits.guestMealsEnabled,
      maxGuestMeals: limits.guestMealsEnabled ? limits.maxGuestMeals ?? 1 : null,
    };
  }

  private async assertUniqueCode(code: string, excludeId?: string) {
    const existing = await this.prisma.organizationUnit.findFirst({
      where: {
        code,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('کد واحد تکراری است');
    }
  }

  private async assertKind(kindId: string) {
    const kind = await this.prisma.organizationUnitKind.findUnique({
      where: { id: kindId },
      select: { id: true },
    });
    if (!kind) {
      throw new BadRequestException('نوع واحد یافت نشد');
    }
  }

  private async assertNutritionRep(unitId: string, userId: string) {
    const employee = await this.prisma.user.findFirst({
      where: { id: userId, orgUnitId: unitId },
      select: { id: true },
    });
    if (!employee) {
      throw new BadRequestException('نماینده باید از کارمندان همین واحد باشد');
    }
  }
}
