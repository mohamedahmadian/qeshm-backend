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
import { CreateRestaurantMenuItemDto } from './dto/create-restaurant-menu-item.dto';
import { FindRestaurantMenuItemsQueryDto } from './dto/find-restaurant-menu-items-query.dto';
import { UpdateRestaurantMenuItemDto } from './dto/update-restaurant-menu-item.dto';
import { RestaurantsService } from './restaurants.service';

const menuItemSelect = {
  id: true,
  restaurantId: true,
  foodId: true,
  price: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  food: {
    select: { id: true, name: true, description: true, photoId: true },
  },
} satisfies Prisma.RestaurantMenuItemSelect;

function toMoney(value: Prisma.Decimal) {
  return Number(value);
}

function withPrice<T extends { price: Prisma.Decimal }>(item: T) {
  return { ...item, price: toMoney(item.price) };
}

@Injectable()
export class RestaurantMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
  ) {}

  async findAll(restaurantId: string, query: FindRestaurantMenuItemsQueryDto) {
    await this.restaurants.findOne(restaurantId);
    const where: Prisma.RestaurantMenuItemWhereInput = {
      restaurantId,
      isActive: query.isActive,
      OR: query.q
        ? [
            { food: { name: containsInsensitive(query.q) } },
            { food: { description: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
    const orderBy =
      resolveSortOrder<Prisma.RestaurantMenuItemOrderByWithRelationInput>(
        query.sortBy,
        query.sortDir,
        {
          food: (dir) => ({ food: { name: dir } }),
          price: (dir) => ({ price: dir }),
          isActive: (dir) => ({ isActive: dir }),
        },
        [{ createdAt: 'desc' }, { id: 'asc' }],
      );
    if (!wantsPagination(query)) {
      const items = await this.prisma.restaurantMenuItem.findMany({
        where,
        orderBy,
        select: menuItemSelect,
      });
      return items.map(withPrice);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.restaurantMenuItem.findMany({
        where,
        orderBy,
        skip,
        take,
        select: menuItemSelect,
      }),
      this.prisma.restaurantMenuItem.count({ where }),
    ]);
    return paginatedResult(items.map(withPrice), total, page, pageSize);
  }

  async findOne(restaurantId: string, id: string) {
    await this.restaurants.findOne(restaurantId);
    const item = await this.prisma.restaurantMenuItem.findFirst({
      where: { id, restaurantId },
      select: menuItemSelect,
    });
    if (!item) {
      throw new NotFoundException('آیتم برنامه غذایی یافت نشد');
    }
    return withPrice(item);
  }

  async create(restaurantId: string, dto: CreateRestaurantMenuItemDto) {
    await this.restaurants.findOne(restaurantId);
    await this.assertFood(dto.foodId);
    try {
      const item = await this.prisma.restaurantMenuItem.create({
        data: {
          restaurantId,
          foodId: dto.foodId,
          price: new Prisma.Decimal(dto.price),
          isActive: dto.isActive ?? true,
        },
        select: menuItemSelect,
      });
      return withPrice(item);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async update(
    restaurantId: string,
    id: string,
    dto: UpdateRestaurantMenuItemDto,
  ) {
    await this.findOne(restaurantId, id);
    if (dto.foodId) {
      await this.assertFood(dto.foodId);
    }
    try {
      const item = await this.prisma.restaurantMenuItem.update({
        where: { id },
        data: {
          foodId: dto.foodId,
          price:
            dto.price === undefined ? undefined : new Prisma.Decimal(dto.price),
          isActive: dto.isActive,
        },
        select: menuItemSelect,
      });
      return withPrice(item);
    } catch (error) {
      this.rethrowUnique(error);
    }
  }

  async remove(restaurantId: string, id: string) {
    await this.findOne(restaurantId, id);
    await this.prisma.restaurantMenuItem.delete({ where: { id } });
    return { ok: true };
  }

  private async assertFood(id: string) {
    const food = await this.prisma.food.findUnique({ where: { id } });
    if (!food) {
      throw new BadRequestException('غذا معتبر نیست');
    }
  }

  private rethrowUnique(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('این غذا قبلاً برای این رستوران ثبت شده است');
    }
    throw error;
  }
}
