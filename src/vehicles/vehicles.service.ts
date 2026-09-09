import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { parseIsoDate, todayIsoDateTehran } from '../common/iso-date';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { FindVehiclesQueryDto } from './dto/find-vehicles-query.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

const currentAssignmentSelect = {
  id: true,
  type: true,
  status: true,
  startDate: true,
  endDate: true,
  returnedAt: true,
  organizationUnit: { select: { id: true, name: true } },
  person: { select: { id: true, fullName: true } },
} satisfies Prisma.VehicleAssignmentSelect;

export function currentAssignmentWhere(): Prisma.VehicleAssignmentWhereInput {
  const today = parseIsoDate(todayIsoDateTehran());
  return {
    status: 'LENT',
    startDate: { lte: today },
    OR: [{ endDate: null }, { endDate: { gte: today } }],
  };
}

function vehicleSelect() {
  return {
    id: true,
    assetCode: true,
    plate: true,
    type: true,
    brandId: true,
    brand: { select: { id: true, name: true } },
    model: true,
    color: true,
    year: true,
    chassisNumber: true,
    engineNumber: true,
    status: true,
    description: true,
    createdAt: true,
    updatedAt: true,
    assignments: {
      where: currentAssignmentWhere(),
      orderBy: { startDate: 'desc' as const },
      take: 1,
      select: currentAssignmentSelect,
    },
    _count: { select: { assignments: true } },
  } satisfies Prisma.VehicleSelect;
}

function withCurrentAssignment<
  T extends { assignments: unknown[] },
>(item: T) {
  const { assignments, ...rest } = item;
  return {
    ...rest,
    currentAssignment: assignments[0] ?? null,
  };
}

@Injectable()
export class VehiclesService {
  constructor(private readonly prisma: PrismaService) {}

  listWhere(query: FindVehiclesQueryDto): Prisma.VehicleWhereInput {
    const currentWhere: Prisma.VehicleAssignmentWhereInput = {
      ...currentAssignmentWhere(),
      ...(query.organizationUnitId
        ? { organizationUnitId: query.organizationUnitId }
        : {}),
      ...(query.personId ? { personId: query.personId } : {}),
    };
    return {
      type: query.type,
      status: query.status,
      brandId: query.brandId,
      ...(query.organizationUnitId || query.personId
        ? { assignments: { some: currentWhere } }
        : {}),
      OR: query.q
        ? [
            { assetCode: containsInsensitive(query.q) },
            { plate: containsInsensitive(query.q) },
            { brand: { name: containsInsensitive(query.q) } },
            { model: containsInsensitive(query.q) },
            { color: containsInsensitive(query.q) },
            { chassisNumber: containsInsensitive(query.q) },
            { engineNumber: containsInsensitive(query.q) },
            { description: containsInsensitive(query.q) },
            {
              assignments: {
                some: {
                  AND: [
                    currentAssignmentWhere(),
                    {
                      OR: [
                        {
                          organizationUnit: { name: containsInsensitive(query.q) },
                        },
                        { person: { fullName: containsInsensitive(query.q) } },
                      ],
                    },
                  ],
                },
              },
            },
          ]
        : undefined,
    };
  }

  async findAll(query: FindVehiclesQueryDto) {
    const where = this.listWhere(query);
    const orderBy = resolveSortOrder<Prisma.VehicleOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        assetCode: (dir) => ({ assetCode: dir }),
        plate: (dir) => ({ plate: dir }),
        type: (dir) => ({ type: dir }),
        brand: (dir) => ({ brand: { name: dir } }),
        model: (dir) => ({ model: dir }),
        year: (dir) => ({ year: dir }),
        status: (dir) => ({ status: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const items = await this.prisma.vehicle.findMany({
        where,
        orderBy,
        select: vehicleSelect(),
      });
      return items.map(withCurrentAssignment);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        orderBy,
        skip,
        take,
        select: vehicleSelect(),
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    return paginatedResult(
      items.map(withCurrentAssignment),
      total,
      page,
      pageSize,
    );
  }

  async findOne(id: string) {
    const item = await this.prisma.vehicle.findUnique({
      where: { id },
      select: vehicleSelect(),
    });
    if (!item) {
      throw new NotFoundException('وسیله نقلیه یافت نشد');
    }
    return withCurrentAssignment(item);
  }

  async create(dto: CreateVehicleDto) {
    await this.assertUnique(dto);
    await this.assertBrand(dto.brandId);
    const item = await this.prisma.vehicle.create({
      data: {
        assetCode: dto.assetCode,
        plate: dto.plate,
        type: dto.type,
        brandId: dto.brandId,
        model: dto.model,
        color: dto.color,
        year: dto.year,
        chassisNumber: dto.chassisNumber,
        engineNumber: dto.engineNumber,
        status: dto.status ?? 'ACTIVE',
        description: dto.description,
      },
      select: vehicleSelect(),
    });
    return withCurrentAssignment(item);
  }

  async update(id: string, dto: UpdateVehicleDto) {
    await this.findOne(id);
    await this.assertUnique(dto, id);
    if (dto.brandId) {
      await this.assertBrand(dto.brandId);
    }
    const item = await this.prisma.vehicle.update({
      where: { id },
      data: {
        assetCode: dto.assetCode,
        plate: dto.plate,
        type: dto.type,
        brandId: dto.brandId,
        model: dto.model,
        color: dto.color,
        year: dto.year,
        chassisNumber: dto.chassisNumber,
        engineNumber: dto.engineNumber,
        status: dto.status,
        description: dto.description,
      },
      select: vehicleSelect(),
    });
    return withCurrentAssignment(item);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.vehicle.delete({ where: { id } });
    return { ok: true };
  }

  private async assertBrand(id: string) {
    const brand = await this.prisma.vehicleBrand.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!brand) {
      throw new NotFoundException('برند یافت نشد');
    }
  }

  private async assertUnique(
    dto: { assetCode?: string; plate?: string },
    excludeId?: string,
  ) {
    if (dto.assetCode) {
      const taken = await this.prisma.vehicle.findFirst({
        where: {
          assetCode: dto.assetCode,
          id: excludeId ? { not: excludeId } : undefined,
        },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('این کد اموال قبلاً ثبت شده است');
      }
    }
    if (dto.plate) {
      const taken = await this.prisma.vehicle.findFirst({
        where: {
          plate: dto.plate,
          id: excludeId ? { not: excludeId } : undefined,
        },
        select: { id: true },
      });
      if (taken) {
        throw new ConflictException('این پلاک قبلاً ثبت شده است');
      }
    }
  }
}
