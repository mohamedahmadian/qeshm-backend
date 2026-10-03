import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { resolveSortOrder } from '../common/sort-query';
import { containsInsensitive } from '../common/pagination';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FindRestaurantMenuItemsQueryDto } from './dto/find-restaurant-menu-items-query.dto';
import { ReplaceWeeklyMenuDto } from './dto/replace-weekly-menu.dto';
import { RestaurantsService } from './restaurants.service';

const menuItemSelect = {
  id: true,
  restaurantId: true,
  foodId: true,
  weekday: true,
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

function withMenuItem<T extends { price: Prisma.Decimal }>(item: T) {
  return {
    ...item,
    price: toMoney(item.price),
  };
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
      foodId: query.foodId,
      weekday: query.weekday,
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
          weekday: (dir) => ({ weekday: dir }),
          food: (dir) => ({ food: { name: dir } }),
          price: (dir) => ({ price: dir }),
        },
        [{ weekday: 'asc' }, { food: { name: 'asc' } }, { id: 'asc' }],
      );
    const items = await this.prisma.restaurantMenuItem.findMany({
      where,
      orderBy,
      select: menuItemSelect,
    });
    return items.map(withMenuItem);
  }

  async replaceWeekly(restaurantId: string, dto: ReplaceWeeklyMenuDto) {
    await this.restaurants.findOne(restaurantId);
    const seenDays = new Set<number>();
    const foodIds = new Set<string>();
    for (const day of dto.days) {
      if (seenDays.has(day.weekday)) {
        throw new BadRequestException('روز هفته تکراری است');
      }
      seenDays.add(day.weekday);
      const foods = new Set<string>();
      for (const item of day.items) {
        if (foods.has(item.foodId)) {
          throw new BadRequestException('یک غذا در یک روز بیش از یک بار انتخاب شده است');
        }
        foods.add(item.foodId);
        foodIds.add(item.foodId);
      }
    }
    if (seenDays.size !== 7) {
      throw new BadRequestException('برنامه باید هر هفت روز هفته را داشته باشد');
    }
    if (foodIds.size) {
      const found = await this.prisma.food.count({
        where: { id: { in: [...foodIds] } },
      });
      if (found !== foodIds.size) {
        throw new BadRequestException('غذا معتبر نیست');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.restaurantMenuItem.deleteMany({ where: { restaurantId } });
      const data = dto.days.flatMap((day) =>
        day.items.map((item) => ({
          restaurantId,
          foodId: item.foodId,
          weekday: day.weekday,
          price: new Prisma.Decimal(item.price),
          isActive: true,
        })),
      );
      if (data.length) {
        await tx.restaurantMenuItem.createMany({ data });
      }
    });
    return this.findAll(restaurantId, {});
  }
}
