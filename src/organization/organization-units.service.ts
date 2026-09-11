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
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { OrganizationUnitKind, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationUnitDto } from './dto/create-organization-unit.dto';
import { FindOrganizationUnitsQueryDto } from './dto/find-organization-units-query.dto';
import { UpdateOrganizationUnitDto } from './dto/update-organization-unit.dto';
import { buildOrganizationUnitPaths } from './organization-unit-tree';

const unitSelect = {
  id: true,
  name: true,
  kind: true,
  parentId: true,
  phone: true,
  address: true,
  latitude: true,
  longitude: true,
  eitaa: true,
  bale: true,
  rubika: true,
  instagram: true,
  telegram: true,
  whatsapp: true,
  nutritionRepId: true,
  createdAt: true,
  updatedAt: true,
  parent: { select: { id: true, name: true, kind: true } },
  nutritionRep: {
    select: { id: true, firstName: true, lastName: true, fullName: true },
  },
  _count: { select: { employees: true, restaurants: true, children: true } },
} satisfies Prisma.OrganizationUnitSelect;

function toCoord(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value);
}

function toDecimal(value: number | null | undefined) {
  if (value === undefined) {
    return undefined;
  }
  return value == null ? null : new Prisma.Decimal(value);
}

function withCoords<
  T extends { latitude: Prisma.Decimal | null; longitude: Prisma.Decimal | null },
>(item: T) {
  return {
    ...item,
    latitude: toCoord(item.latitude),
    longitude: toCoord(item.longitude),
  };
}

@Injectable()
export class OrganizationUnitsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindOrganizationUnitsQueryDto) {
    const where: Prisma.OrganizationUnitWhereInput = {
      kind: query.kind,
      parentId: query.parentId,
      OR: query.q
        ? [
            { name: containsInsensitive(query.q) },
            { phone: containsInsensitive(query.q) },
            { address: containsInsensitive(query.q) },
            { nutritionRep: { fullName: containsInsensitive(query.q) } },
            { parent: { name: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.OrganizationUnitOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        kind: (dir) => ({ kind: dir }),
        parent: (dir) => ({ parent: { name: dir } }),
        phone: (dir) => ({ phone: dir }),
        nutritionRep: (dir) => ({ nutritionRep: { fullName: dir } }),
        employeeCount: (dir) => ({ employees: { _count: dir } }),
        restaurantCount: (dir) => ({ restaurants: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    const paths = await this.unitPaths();
    if (!wantsPagination(query)) {
      const items = await this.prisma.organizationUnit.findMany({
        where,
        orderBy,
        select: unitSelect,
      });
      return items.map((item) => this.withMeta(item, paths));
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.organizationUnit.findMany({
        where,
        orderBy,
        skip,
        take,
        select: unitSelect,
      }),
      this.prisma.organizationUnit.count({ where }),
    ]);
    return paginatedResult(
      items.map((item) => this.withMeta(item, paths)),
      total,
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const unit = await this.prisma.organizationUnit.findUnique({
      where: { id },
      select: unitSelect,
    });
    if (!unit) {
      throw new NotFoundException('واحد سازمانی یافت نشد');
    }
    const paths = await this.unitPaths();
    return this.withMeta(unit, paths);
  }

  async create(dto: CreateOrganizationUnitDto) {
    await this.assertValidParent(null, dto.parentId);
    const unit = await this.prisma.organizationUnit.create({
      data: {
        name: dto.name,
        kind: dto.kind ?? OrganizationUnitKind.DEPARTMENT,
        parent: dto.parentId ? { connect: { id: dto.parentId } } : undefined,
        phone: dto.phone,
        address: dto.address,
        latitude: toDecimal(dto.latitude),
        longitude: toDecimal(dto.longitude),
        eitaa: dto.eitaa,
        bale: dto.bale,
        rubika: dto.rubika,
        instagram: dto.instagram,
        telegram: dto.telegram,
        whatsapp: dto.whatsapp,
      },
      select: unitSelect,
    });
    const paths = await this.unitPaths();
    return this.withMeta(unit, paths);
  }

  async update(id: string, dto: UpdateOrganizationUnitDto) {
    await this.findOne(id);
    if (dto.parentId !== undefined) {
      await this.assertValidParent(id, dto.parentId);
    }
    if (dto.nutritionRepId !== undefined) {
      await this.assertNutritionRep(id, dto.nutritionRepId);
    }
    const unit = await this.prisma.organizationUnit.update({
      where: { id },
      data: {
        name: dto.name,
        kind: dto.kind,
        parent:
          dto.parentId === undefined
            ? undefined
            : dto.parentId
              ? { connect: { id: dto.parentId } }
              : { disconnect: true },
        phone: dto.phone,
        address: dto.address,
        latitude: toDecimal(dto.latitude),
        longitude: toDecimal(dto.longitude),
        eitaa: dto.eitaa,
        bale: dto.bale,
        rubika: dto.rubika,
        instagram: dto.instagram,
        telegram: dto.telegram,
        whatsapp: dto.whatsapp,
        nutritionRep:
          dto.nutritionRepId === undefined
            ? undefined
            : dto.nutritionRepId
              ? { connect: { id: dto.nutritionRepId } }
              : { disconnect: true },
      },
      select: unitSelect,
    });
    const paths = await this.unitPaths();
    return this.withMeta(unit, paths);
  }

  async remove(id: string) {
    await this.findOne(id);
    const childCount = await this.prisma.organizationUnit.count({
      where: { parentId: id },
    });
    if (childCount > 0) {
      throw new ConflictException('ابتدا واحدهای زیرمجموعه را منتقل یا حذف کنید');
    }
    const used = await this.prisma.user.count({ where: { orgUnitId: id } });
    if (used > 0) {
      throw new ConflictException('ابتدا کارمندان این واحد را منتقل یا حذف کنید');
    }
    const assigned = await this.prisma.vehicleAssignment.count({
      where: { organizationUnitId: id },
    });
    if (assigned > 0) {
      throw new ConflictException(
        'ابتدا تخصیص وسایل نقلیه این واحد را ببندید یا حذف کنید',
      );
    }
    await this.prisma.organizationUnit.delete({ where: { id } });
    return { ok: true };
  }

  private async unitPaths() {
    const catalog = await this.prisma.organizationUnit.findMany({
      select: { id: true, name: true, parentId: true },
    });
    return buildOrganizationUnitPaths(catalog);
  }

  private withMeta<
    T extends {
      id: string;
      name: string;
      latitude: Prisma.Decimal | null;
      longitude: Prisma.Decimal | null;
    },
  >(item: T, paths: Map<string, string>) {
    return {
      ...withCoords(item),
      pathLabel: paths.get(item.id) ?? item.name,
    };
  }

  private async assertValidParent(
    unitId: string | null,
    parentId: string | null | undefined,
  ) {
    if (!parentId) return;
    if (unitId && parentId === unitId) {
      throw new BadRequestException('واحد نمی‌تواند زیرمجموعهٔ خودش باشد');
    }
    const parent = await this.prisma.organizationUnit.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true },
    });
    if (!parent) {
      throw new BadRequestException('واحد بالادست یافت نشد');
    }
    if (!unitId) return;
    let current = parent.parentId;
    const seen = new Set<string>([parent.id]);
    while (current) {
      if (current === unitId) {
        throw new BadRequestException(
          'واحد بالادست نمی‌تواند از زیرمجموعه‌های همین واحد باشد',
        );
      }
      if (seen.has(current)) break;
      seen.add(current);
      const node = await this.prisma.organizationUnit.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = node?.parentId ?? null;
    }
  }

  private async assertNutritionRep(unitId: string, userId: string | null) {
    if (!userId) return;
    const employee = await this.prisma.user.findFirst({
      where: { id: userId, orgUnitId: unitId },
      select: { id: true },
    });
    if (!employee) {
      throw new BadRequestException(
        'نماینده تغذیه باید از کارمندان همین واحد باشد',
      );
    }
  }
}
