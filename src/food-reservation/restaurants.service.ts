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
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { FindRestaurantsQueryDto } from './dto/find-restaurants-query.dto';
import { UpdateRestaurantDto } from './dto/update-restaurant.dto';

const restaurantSelect = {
  id: true,
  name: true,
  phone: true,
  address: true,
  logoId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { menuItems: true } },
} satisfies Prisma.RestaurantSelect;

function optionalConnect(id: string | null | undefined) {
  if (id === undefined) return undefined;
  return id ? { connect: { id } } : { disconnect: true };
}

@Injectable()
export class RestaurantsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindRestaurantsQueryDto) {
    const where: Prisma.RestaurantWhereInput = {
      OR: query.q
        ? [
            { name: containsInsensitive(query.q) },
            { phone: containsInsensitive(query.q) },
            { address: containsInsensitive(query.q) },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.RestaurantOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        name: (dir) => ({ name: dir }),
        phone: (dir) => ({ phone: dir }),
        address: (dir) => ({ address: dir }),
        menuItemCount: (dir) => ({ menuItems: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      return this.prisma.restaurant.findMany({
        where,
        orderBy,
        select: restaurantSelect,
      });
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.restaurant.findMany({
        where,
        orderBy,
        skip,
        take,
        select: restaurantSelect,
      }),
      this.prisma.restaurant.count({ where }),
    ]);
    return paginatedResult(items, total, page, pageSize);
  }

  async findOne(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: restaurantSelect,
    });
    if (!restaurant) {
      throw new NotFoundException('رستوران یافت نشد');
    }
    return restaurant;
  }

  async create(dto: CreateRestaurantDto) {
    await this.assertImage(dto.logoId);
    return this.prisma.restaurant.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        logoId: dto.logoId ?? null,
      },
      select: restaurantSelect,
    });
  }

  async update(id: string, dto: UpdateRestaurantDto) {
    await this.findOne(id);
    await this.assertImage(dto.logoId);
    return this.prisma.restaurant.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        address: dto.address,
        logo: optionalConnect(dto.logoId),
      },
      select: restaurantSelect,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    const used = await this.prisma.organizationUnitRestaurant.count({
      where: { restaurantId: id },
    });
    if (used > 0) {
      throw new ConflictException('ابتدا این رستوران را از واحدهای سازمانی جدا کنید');
    }
    await this.prisma.restaurant.delete({ where: { id } });
    return { ok: true };
  }

  private async assertImage(id?: string | null) {
    if (!id) return;
    const count = await this.prisma.storedImage.count({ where: { id } });
    if (!count) {
      throw new BadRequestException('تصویر معتبر نیست');
    }
  }
}
