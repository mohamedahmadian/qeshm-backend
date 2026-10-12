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

export const STAFF_MEAL_PREFIX = 'غذای کارمندی رستوران ';
export const MANAGEMENT_MEAL_PREFIX = 'غذای مدیریتی رستوران ';

const restaurantSelect = {
  id: true,
  name: true,
  phone: true,
  address: true,
  logoId: true,
  employeeMealPrice: true,
  managementMealPrice: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { menuItems: true, orgUnits: true } },
} satisfies Prisma.RestaurantSelect;

type RestaurantRow = Prisma.RestaurantGetPayload<{ select: typeof restaurantSelect }>;

function presentRestaurant(row: RestaurantRow) {
  return {
    ...row,
    employeeMealPrice: row.employeeMealPrice == null ? null : Number(row.employeeMealPrice),
    managementMealPrice:
      row.managementMealPrice == null ? null : Number(row.managementMealPrice),
  };
}

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
        unitCount: (dir) => ({ orgUnits: { _count: dir } }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const rows = await this.prisma.restaurant.findMany({
        where,
        orderBy,
        select: restaurantSelect,
      });
      return rows.map(presentRestaurant);
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
    return paginatedResult(items.map(presentRestaurant), total, page, pageSize);
  }

  async findOne(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: restaurantSelect,
    });
    if (!restaurant) {
      throw new NotFoundException('رستوران یافت نشد');
    }
    return presentRestaurant(restaurant);
  }

  async create(dto: CreateRestaurantDto) {
    await this.assertImage(dto.logoId);
    return this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: dto.name,
          phone: dto.phone,
          address: dto.address,
          logoId: dto.logoId ?? null,
          employeeMealPrice: new Prisma.Decimal(dto.employeeMealPrice),
          managementMealPrice: new Prisma.Decimal(dto.managementMealPrice),
        },
        select: restaurantSelect,
      });
      await this.syncStandardMeals(
        tx,
        restaurant.id,
        dto.name,
        dto.employeeMealPrice,
        dto.managementMealPrice,
      );
      return presentRestaurant(restaurant);
    });
  }

  async update(id: string, dto: UpdateRestaurantDto) {
    const current = await this.findOne(id);
    await this.assertImage(dto.logoId);
    const name = dto.name ?? current.name;
    const employeeMealPrice = dto.employeeMealPrice ?? current.employeeMealPrice;
    const managementMealPrice = dto.managementMealPrice ?? current.managementMealPrice;
    return this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.update({
        where: { id },
        data: {
          name: dto.name,
          phone: dto.phone,
          address: dto.address,
          logo: optionalConnect(dto.logoId),
          employeeMealPrice:
            dto.employeeMealPrice == null ? undefined : new Prisma.Decimal(dto.employeeMealPrice),
          managementMealPrice:
            dto.managementMealPrice == null
              ? undefined
              : new Prisma.Decimal(dto.managementMealPrice),
        },
        select: restaurantSelect,
      });
      if (employeeMealPrice != null && managementMealPrice != null) {
        await this.syncStandardMeals(
          tx,
          id,
          name,
          employeeMealPrice,
          managementMealPrice,
          current.name,
        );
      }
      return presentRestaurant(restaurant);
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
    const advanced = await this.prisma.advancedFoodOrder.count({
      where: { restaurantId: id },
    });
    if (advanced > 0) {
      throw new ConflictException('این رستوران سفارش رزرو پیشرفته دارد و قابل حذف نیست');
    }
    await this.prisma.restaurant.delete({ where: { id } });
    return { ok: true };
  }

  private async syncStandardMeals(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    name: string,
    employeeMealPrice: number,
    managementMealPrice: number,
    previousName?: string,
  ) {
    const meals = [
      { prefix: STAFF_MEAL_PREFIX, price: employeeMealPrice },
      { prefix: MANAGEMENT_MEAL_PREFIX, price: managementMealPrice },
    ];
    for (const meal of meals) {
      const foodName = `${meal.prefix}${name}`;
      const previousFoodName =
        previousName && previousName !== name ? `${meal.prefix}${previousName}` : undefined;
      const foodId = await this.ensureMealFood(tx, foodName, previousFoodName);
      if (previousFoodName) {
        const previous = await tx.food.findFirst({
          where: { name: previousFoodName },
          select: { id: true },
        });
        if (previous && previous.id !== foodId) {
          await tx.restaurantMenuItem.deleteMany({
            where: { restaurantId, foodId: previous.id },
          });
        }
      }
      const price = new Prisma.Decimal(meal.price);
      for (let weekday = 0; weekday < 7; weekday += 1) {
        await tx.restaurantMenuItem.upsert({
          where: {
            restaurantId_foodId_weekday: { restaurantId, foodId, weekday },
          },
          create: {
            restaurantId,
            foodId,
            weekday,
            price,
            isActive: true,
          },
          update: { price },
        });
      }
    }
  }

  /** اگر غذای پیش‌فرض رستوران نباشد، همان‌جا ساخته و برای هر روز هفته در منو ثبت می‌شود. */
  async provisionStandardMeal(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    foodName: string,
    price: number,
  ) {
    const foodId = await this.ensureMealFood(tx, foodName);
    const decimal = new Prisma.Decimal(price);
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const existing = await tx.restaurantMenuItem.findUnique({
        where: { restaurantId_foodId_weekday: { restaurantId, foodId, weekday } },
        select: { id: true },
      });
      if (existing) continue;
      await tx.restaurantMenuItem.create({
        data: {
          restaurantId,
          foodId,
          weekday,
          price: decimal,
          isActive: true,
        },
      });
    }
    return foodId;
  }

  private async ensureMealFood(
    tx: Prisma.TransactionClient,
    name: string,
    previousName?: string,
  ) {
    const existing = await tx.food.findFirst({
      where: { name },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing.id;
    if (previousName) {
      const previous = await tx.food.findFirst({
        where: { name: previousName },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (previous) {
        await tx.food.update({ where: { id: previous.id }, data: { name } });
        return previous.id;
      }
    }
    const created = await tx.food.create({ data: { name }, select: { id: true } });
    return created.id;
  }

  private async assertImage(id?: string | null) {
    if (!id) return;
    const count = await this.prisma.storedImage.count({ where: { id } });
    if (!count) {
      throw new BadRequestException('تصویر معتبر نیست');
    }
  }
}
