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
import { CreateOrganizationUnitRestaurantDto } from './dto/create-organization-unit-restaurant.dto';
import { FindOrganizationUnitRestaurantsQueryDto } from './dto/find-organization-unit-restaurants-query.dto';
import { UpdateOrganizationUnitRestaurantDto } from './dto/update-organization-unit-restaurant.dto';
import { OrganizationUnitsService } from './organization-units.service';

const linkSelect = {
  id: true,
  unitId: true,
  restaurantId: true,
  createdAt: true,
  updatedAt: true,
  restaurant: {
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      logoId: true,
    },
  },
} satisfies Prisma.OrganizationUnitRestaurantSelect;

@Injectable()
export class OrganizationUnitRestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly units: OrganizationUnitsService,
  ) {}

  async findAll(unitId: string, query: FindOrganizationUnitRestaurantsQueryDto) {
    await this.units.findOne(unitId);
    const where: Prisma.OrganizationUnitRestaurantWhereInput = {
      unitId,
      OR: query.q
        ? [
            { restaurant: { name: containsInsensitive(query.q) } },
            { restaurant: { phone: containsInsensitive(query.q) } },
            { restaurant: { address: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
    const orderBy =
      resolveSortOrder<Prisma.OrganizationUnitRestaurantOrderByWithRelationInput>(
        query.sortBy,
        query.sortDir,
        {
          restaurant: (dir) => ({ restaurant: { name: dir } }),
          phone: (dir) => ({ restaurant: { phone: dir } }),
          address: (dir) => ({ restaurant: { address: dir } }),
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

  async findOne(unitId: string, id: string) {
    await this.units.findOne(unitId);
    const item = await this.prisma.organizationUnitRestaurant.findFirst({
      where: { id, unitId },
      select: linkSelect,
    });
    if (!item) {
      throw new NotFoundException('رستوران این واحد یافت نشد');
    }
    return item;
  }

  async create(unitId: string, dto: CreateOrganizationUnitRestaurantDto) {
    await this.units.findOne(unitId);
    const ids = [...new Set(dto.restaurantIds)];
    await this.assertRestaurants(ids);
    try {
      await this.prisma.organizationUnitRestaurant.createMany({
        data: ids.map((restaurantId) => ({ unitId, restaurantId })),
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
    return this.prisma.organizationUnitRestaurant.findMany({
      where: { unitId, restaurantId: { in: ids } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: linkSelect,
    });
  }

  async update(
    unitId: string,
    id: string,
    dto: UpdateOrganizationUnitRestaurantDto,
  ) {
    await this.findOne(unitId, id);
    await this.assertRestaurants([dto.restaurantId]);
    try {
      return await this.prisma.organizationUnitRestaurant.update({
        where: { id },
        data: { restaurantId: dto.restaurantId },
        select: linkSelect,
      });
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(unitId: string, id: string) {
    await this.findOne(unitId, id);
    await this.prisma.organizationUnitRestaurant.delete({ where: { id } });
    return { ok: true };
  }

  private async assertRestaurants(ids: string[]) {
    const count = await this.prisma.restaurant.count({
      where: { id: { in: ids } },
    });
    if (count !== ids.length) {
      throw new BadRequestException('رستوران معتبر نیست');
    }
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این رستوران قبلاً برای این واحد ثبت شده است');
    }
    throw error;
  }
}
