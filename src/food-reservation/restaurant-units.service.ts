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
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRestaurantUnitDto } from './dto/create-restaurant-unit.dto';
import { FindRestaurantUnitsQueryDto } from './dto/find-restaurant-units-query.dto';
import { UpdateRestaurantUnitDto } from './dto/update-restaurant-unit.dto';
import { RestaurantsService } from './restaurants.service';

const linkSelect = {
  id: true,
  unitId: true,
  restaurantId: true,
  createdAt: true,
  updatedAt: true,
  unit: {
    select: {
      id: true,
      name: true,
      phone: true,
      kind: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.OrganizationUnitRestaurantSelect;

@Injectable()
export class RestaurantUnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
  ) {}

  async findAll(restaurantId: string, query: FindRestaurantUnitsQueryDto) {
    await this.restaurants.findOne(restaurantId);
    const where: Prisma.OrganizationUnitRestaurantWhereInput = {
      restaurantId,
      OR: query.q
        ? [
            { unit: { name: containsInsensitive(query.q) } },
            { unit: { phone: containsInsensitive(query.q) } },
            { unit: { kind: { name: containsInsensitive(query.q) } } },
            { unit: { parent: { name: containsInsensitive(query.q) } } },
          ]
        : undefined,
    };
    const orderBy =
      resolveSortOrder<Prisma.OrganizationUnitRestaurantOrderByWithRelationInput>(
        query.sortBy,
        query.sortDir,
        {
          unit: (dir) => ({ unit: { name: dir } }),
          kind: (dir) => ({ unit: { kind: { name: dir } } }),
          phone: (dir) => ({ unit: { phone: dir } }),
        },
        [{ createdAt: 'desc' }, { id: 'asc' }],
      );
    if (!wantsPagination(query)) {
      return this.prisma.organizationUnitRestaurant.findMany({
        where,
        orderBy,
        select: linkSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.organizationUnitRestaurant.findMany({
        where,
        orderBy,
        skip,
        take,
        select: linkSelect,
      }),
      this.prisma.organizationUnitRestaurant.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(restaurantId: string, id: string) {
    await this.restaurants.findOne(restaurantId);
    const item = await this.prisma.organizationUnitRestaurant.findFirst({
      where: { id, restaurantId },
      select: linkSelect,
    });
    if (!item) {
      throw new NotFoundException('واحد این رستوران یافت نشد');
    }
    return item;
  }

  async create(restaurantId: string, dto: CreateRestaurantUnitDto) {
    await this.restaurants.findOne(restaurantId);
    const ids = [...new Set(dto.unitIds)];
    await this.assertUnits(ids);
    try {
      await this.prisma.organizationUnitRestaurant.createMany({
        data: ids.map((unitId) => ({ unitId, restaurantId })),
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
    return this.prisma.organizationUnitRestaurant.findMany({
      where: { restaurantId, unitId: { in: ids } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: linkSelect,
    });
  }

  async update(restaurantId: string, id: string, dto: UpdateRestaurantUnitDto) {
    await this.findOne(restaurantId, id);
    await this.assertUnits([dto.unitId]);
    try {
      return await this.prisma.organizationUnitRestaurant.update({
        where: { id },
        data: { unitId: dto.unitId },
        select: linkSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(restaurantId: string, id: string) {
    await this.findOne(restaurantId, id);
    await this.prisma.organizationUnitRestaurant.delete({ where: { id } });
    return { ok: true };
  }

  private async assertUnits(ids: string[]) {
    const count = await this.prisma.organizationUnit.count({
      where: { id: { in: ids } },
    });
    if (count !== ids.length) {
      throw new BadRequestException('واحد سازمانی معتبر نیست');
    }
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این واحد قبلاً برای این رستوران ثبت شده است');
    }
    throw error;
  }
}
