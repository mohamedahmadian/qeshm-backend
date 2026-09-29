import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  parseIsoDate,
  startOfIranWeekIso,
  todayIsoDateTehran,
  toIsoDateOnly,
} from '../common/iso-date';
import { getRequestLocale } from '../common/request-locale';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { FoodReservationStatus, Prisma } from '../generated/prisma/client';
import { buildOrganizationUnitPaths } from '../organization/organization-unit-tree';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFoodReservationDto } from './dto/create-food-reservation.dto';
import { FindFoodReservationsQueryDto } from './dto/find-food-reservations-query.dto';
import {
  FoodReservationLastQuantityQueryDto,
  FoodReservationMenuQueryDto,
} from './dto/food-reservation-menu-query.dto';
import { MineFoodSummaryQueryDto } from './dto/mine-food-summary-query.dto';
import {
  bucketStart,
  defaultMineSummaryRange,
  eachBucket,
  mineSummaryGrain,
} from './mine-summary-range';

function foodReservations(prisma: PrismaService) {
  return (
    prisma as unknown as { foodReservation: Prisma.FoodReservationDelegate }
  ).foodReservation;
}

const reservationSelect = {
  id: true,
  reservedAt: true,
  restaurantId: true,
  foodId: true,
  userId: true,
  orgUnitId: true,
  quantity: true,
  unitPrice: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  restaurant: { select: { id: true, name: true, logoId: true } },
  food: { select: { id: true, name: true, photoId: true } },
  user: { select: { id: true, fullName: true } },
  orgUnit: { select: { id: true, name: true } },
} satisfies Prisma.FoodReservationSelect;

function withReservation<
  T extends { reservedAt: Date; unitPrice: Prisma.Decimal; quantity: number },
>(item: T) {
  return {
    ...item,
    reservedAt: toIsoDateOnly(item.reservedAt),
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.unitPrice) * item.quantity,
  };
}

type CostGroup = {
  id: string;
  name: string;
  count: number;
  quantity: number;
  totalPrice: number;
};

type FoodCostGroup = CostGroup & {
  priceSum: number;
  minUnitPrice: number;
  maxUnitPrice: number;
};

type PeriodCostGroup = {
  period: string;
  count: number;
  quantity: number;
  totalPrice: number;
};

function bumpCost(
  map: Map<string, CostGroup>,
  id: string,
  name: string,
  amount: number,
  quantity: number,
) {
  const current = map.get(id) ?? {
    id,
    name,
    count: 0,
    quantity: 0,
    totalPrice: 0,
  };
  current.count += 1;
  current.quantity += quantity;
  current.totalPrice += amount;
  map.set(id, current);
}

function bumpFood(
  map: Map<string, FoodCostGroup>,
  id: string,
  name: string,
  amount: number,
  quantity: number,
  unitPrice: number,
) {
  const current = map.get(id) ?? {
    id,
    name,
    count: 0,
    quantity: 0,
    totalPrice: 0,
    priceSum: 0,
    minUnitPrice: unitPrice,
    maxUnitPrice: unitPrice,
  };
  current.count += 1;
  current.quantity += quantity;
  current.totalPrice += amount;
  current.priceSum += unitPrice * quantity;
  current.minUnitPrice = Math.min(current.minUnitPrice, unitPrice);
  current.maxUnitPrice = Math.max(current.maxUnitPrice, unitPrice);
  map.set(id, current);
}

function bumpPeriod(
  map: Map<string, PeriodCostGroup>,
  period: string,
  amount: number,
  quantity: number,
) {
  const current = map.get(period) ?? {
    period,
    count: 0,
    quantity: 0,
    totalPrice: 0,
  };
  current.count += 1;
  current.quantity += quantity;
  current.totalPrice += amount;
  map.set(period, current);
}

function byCost(a: { totalPrice: number }, b: { totalPrice: number }) {
  return b.totalPrice - a.totalPrice;
}

function byPeriod(a: { period: string }, b: { period: string }) {
  return a.period.localeCompare(b.period);
}

@Injectable()
export class FoodReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async context(userId: string, isAdmin = false) {
    const user = await this.requireEmployee(userId);
    if (isAdmin) {
      const units = await this.prisma.organizationUnit.findMany({
        select: {
          id: true,
          name: true,
          parentId: true,
          maxMeals: true,
          restaurants: {
            select: {
              restaurant: { select: { id: true, name: true, logoId: true } },
            },
          },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
      const paths = buildOrganizationUnitPaths(units);
      return {
        orgUnit: user.orgUnit,
        isNutritionRep: this.isNutritionRep(user),
        canManage: true,
        restaurants: [],
        units: units.map((unit) => ({
          id: unit.id,
          name: unit.name,
          pathLabel: paths.get(unit.id) ?? unit.name,
          maxMeals: unit.maxMeals,
          restaurants: unit.restaurants
            .map((link) => link.restaurant)
            .sort(
              (a, b) => a.name.localeCompare(b.name, 'fa') || a.id.localeCompare(b.id),
            ),
        })),
      };
    }
    const restaurants = user.orgUnitId
      ? await this.prisma.restaurant.findMany({
          where: { orgUnits: { some: { unitId: user.orgUnitId } } },
          select: { id: true, name: true, logoId: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        })
      : [];
    return {
      orgUnit: user.orgUnit,
      isNutritionRep: this.isNutritionRep(user),
      canManage: false,
      restaurants,
      units: [],
    };
  }

  async lastQuantity(
    userId: string,
    query: FoodReservationLastQuantityQueryDto,
    isAdmin = false,
  ) {
    const user = await this.requireEmployee(userId);
    const unitId = isAdmin && query.orgUnitId ? query.orgUnitId : user.orgUnitId;
    if (!unitId) return { quantity: null };
    const matched = await this.findLastQuantity(unitId, {
      restaurantId: query.restaurantId,
      foodId: query.foodId,
    });
    if (matched != null) return { quantity: matched };
    if (!query.restaurantId && !query.foodId) return { quantity: null };
    const unitLast = await this.findLastQuantity(unitId, {});
    return { quantity: unitLast };
  }

  private async findLastQuantity(
    unitId: string,
    filter: { restaurantId?: string; foodId?: string },
  ) {
    const last = await foodReservations(this.prisma).findFirst({
      where: {
        orgUnitId: unitId,
        restaurantId: filter.restaurantId,
        foodId: filter.foodId,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { quantity: true },
    });
    return last?.quantity ?? null;
  }

  async menu(userId: string, query: FoodReservationMenuQueryDto, isAdmin = false) {
    const user = await this.requireEmployee(userId);
    const unitId =
      isAdmin && query.orgUnitId ? query.orgUnitId : user.orgUnitId;
    if (!unitId) {
      throw new BadRequestException('ابتدا واحد سازمانی شما باید مشخص شود');
    }
    const linked = await this.prisma.organizationUnitRestaurant.findFirst({
      where: { unitId, restaurantId: query.restaurantId },
      select: { unitId: true },
    });
    if (!linked) {
      throw new BadRequestException(
        'این رستوران برای واحد سازمانی شما تعریف نشده است',
      );
    }
    const items = await this.prisma.restaurantMenuItem.findMany({
      where: {
        restaurantId: query.restaurantId,
        isActive: true,
        offeredAt: parseIsoDate(query.offeredAt),
      },
      orderBy: [{ food: { name: 'asc' } }, { id: 'asc' }],
      select: {
        id: true,
        restaurantId: true,
        foodId: true,
        offeredAt: true,
        price: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        food: {
          select: { id: true, name: true, description: true, photoId: true },
        },
      },
    });
    return items.map((item) => ({
      ...item,
      price: Number(item.price),
      offeredAt: toIsoDateOnly(item.offeredAt),
    }));
  }

  async mineSummary(userId: string, query: MineFoodSummaryQueryDto) {
    const locale = getRequestLocale();
    const period = query.period ?? 'week';
    const defaults = defaultMineSummaryRange(period, locale);
    const reservedFrom = query.reservedFrom ?? defaults.from;
    const reservedTo = query.reservedTo ?? defaults.to;
    if (reservedFrom > reservedTo) {
      throw new BadRequestException('تاریخ پایان نمی‌تواند قبل از تاریخ شروع باشد');
    }
    const grain = mineSummaryGrain(period);
    const q = query.q?.trim();
    const rows = await foodReservations(this.prisma).findMany({
      where: {
        userId,
        reservedAt: {
          gte: parseIsoDate(reservedFrom),
          lte: parseIsoDate(reservedTo),
        },
        OR: q
          ? [
              { food: { name: containsInsensitive(q) } },
              { restaurant: { name: containsInsensitive(q) } },
            ]
          : undefined,
      },
      select: {
        reservedAt: true,
        quantity: true,
        unitPrice: true,
        foodId: true,
        food: { select: { name: true } },
      },
    });

    const summary = { count: 0, quantity: 0, totalPrice: 0 };
    const foodMap = new Map<
      string,
      { id: string; name: string; count: number; quantity: number; totalPrice: number }
    >();
    const periodMap = new Map<string, PeriodCostGroup>();
    for (const key of eachBucket(reservedFrom, reservedTo, grain, locale)) {
      periodMap.set(key, { period: key, count: 0, quantity: 0, totalPrice: 0 });
    }

    for (const row of rows) {
      const amount = Number(row.unitPrice) * row.quantity;
      summary.count += 1;
      summary.quantity += row.quantity;
      summary.totalPrice += amount;
      const food = foodMap.get(row.foodId) ?? {
        id: row.foodId,
        name: row.food.name,
        count: 0,
        quantity: 0,
        totalPrice: 0,
      };
      food.count += 1;
      food.quantity += row.quantity;
      food.totalPrice += amount;
      foodMap.set(row.foodId, food);
      const day = toIsoDateOnly(row.reservedAt);
      if (day) bumpPeriod(periodMap, bucketStart(day, grain, locale), amount, row.quantity);
    }

    const byAmount = (
      a: { quantity: number; totalPrice: number },
      b: { quantity: number; totalPrice: number },
    ) => b.quantity - a.quantity || b.totalPrice - a.totalPrice;

    return {
      period,
      grain,
      reservedFrom,
      reservedTo,
      summary,
      byFood: [...foodMap.values()].sort(byAmount),
      byPeriod: [...periodMap.values()].sort(byPeriod),
    };
  }

  async findAll(query: FindFoodReservationsQueryDto, userId?: string) {
    if (query.mine && !userId) {
      throw new UnauthorizedException();
    }
    const where = this.buildWhere(query, userId);
    const orderBy = this.sortOrder(query);
    if (!wantsPagination(query)) {
      const items = await foodReservations(this.prisma).findMany({
        where,
        orderBy,
        select: reservationSelect,
      });
      return items.map(withReservation);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      foodReservations(this.prisma).findMany({
        where,
        orderBy,
        skip,
        take,
        select: reservationSelect,
      }),
      foodReservations(this.prisma).count({ where }),
    ]);
    return paginatedResult(items.map(withReservation), total, page, pageSize);
  }

  async report(query: FindFoodReservationsQueryDto) {
    if (!query.restaurantId) {
      throw new BadRequestException('ابتدا رستوران را انتخاب کنید');
    }
    const where = this.buildWhere({ ...query, mine: undefined });
    const orderBy = this.sortOrder(query);
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total, aggregates] = await Promise.all([
      foodReservations(this.prisma).findMany({
        where,
        orderBy,
        skip,
        take,
        select: reservationSelect,
      }),
      foodReservations(this.prisma).count({ where }),
      foodReservations(this.prisma).findMany({
        where,
        select: {
          quantity: true,
          unitPrice: true,
          status: true,
          foodId: true,
          orgUnitId: true,
          food: { select: { name: true } },
          orgUnit: { select: { name: true } },
        },
      }),
    ]);

    const summary = {
      count: 0,
      quantity: 0,
      totalPrice: 0,
      pendingCount: 0,
      confirmedCount: 0,
      pendingQuantity: 0,
      confirmedQuantity: 0,
      pendingTotal: 0,
      confirmedTotal: 0,
    };
    const foodMap = new Map<
      string,
      { id: string; name: string; count: number; quantity: number; totalPrice: number }
    >();
    const unitMap = new Map<
      string,
      { id: string; name: string; count: number; quantity: number; totalPrice: number }
    >();

    for (const row of aggregates) {
      const amount = Number(row.unitPrice) * row.quantity;
      summary.count += 1;
      summary.quantity += row.quantity;
      summary.totalPrice += amount;
      if (row.status === FoodReservationStatus.CONFIRMED) {
        summary.confirmedCount += 1;
        summary.confirmedQuantity += row.quantity;
        summary.confirmedTotal += amount;
      } else {
        summary.pendingCount += 1;
        summary.pendingQuantity += row.quantity;
        summary.pendingTotal += amount;
      }
      const food = foodMap.get(row.foodId) ?? {
        id: row.foodId,
        name: row.food.name,
        count: 0,
        quantity: 0,
        totalPrice: 0,
      };
      food.count += 1;
      food.quantity += row.quantity;
      food.totalPrice += amount;
      foodMap.set(row.foodId, food);
      const unit = unitMap.get(row.orgUnitId) ?? {
        id: row.orgUnitId,
        name: row.orgUnit.name,
        count: 0,
        quantity: 0,
        totalPrice: 0,
      };
      unit.count += 1;
      unit.quantity += row.quantity;
      unit.totalPrice += amount;
      unitMap.set(row.orgUnitId, unit);
    }

    const byAmount = (
      a: { quantity: number; totalPrice: number },
      b: { quantity: number; totalPrice: number },
    ) => b.quantity - a.quantity || b.totalPrice - a.totalPrice;

    return {
      ...paginatedResult(items.map(withReservation), total, page, pageSize),
      summary,
      byFood: [...foodMap.values()].sort(byAmount),
      byUnit: [...unitMap.values()].sort(byAmount),
    };
  }

  async costEstimate(query: FindFoodReservationsQueryDto) {
    const where = this.buildWhere({ ...query, mine: undefined });
    const rows = await foodReservations(this.prisma).findMany({
      where,
      select: {
        reservedAt: true,
        quantity: true,
        unitPrice: true,
        status: true,
        foodId: true,
        orgUnitId: true,
        restaurantId: true,
        userId: true,
        food: { select: { name: true } },
        orgUnit: { select: { name: true } },
        restaurant: { select: { name: true } },
      },
    });

    const summary = {
      totalCost: 0,
      confirmedCost: 0,
      pendingCost: 0,
      totalQuantity: 0,
      confirmedQuantity: 0,
      pendingQuantity: 0,
      reservationCount: 0,
      confirmedCount: 0,
      pendingCount: 0,
      avgCostPerServing: 0,
      avgCostPerReservation: 0,
      avgDailyCost: 0,
      uniqueDays: 0,
      uniqueEmployees: 0,
    };
    const unitMap = new Map<string, CostGroup>();
    const restaurantMap = new Map<string, CostGroup>();
    const foodMap = new Map<string, FoodCostGroup>();
    const dayMap = new Map<string, PeriodCostGroup>();
    const weekMap = new Map<string, PeriodCostGroup>();
    const monthMap = new Map<string, PeriodCostGroup>();
    const days = new Set<string>();
    const employees = new Set<string>();

    for (const row of rows) {
      const amount = Number(row.unitPrice) * row.quantity;
      const unitPrice = Number(row.unitPrice);
      const day = toIsoDateOnly(row.reservedAt) ?? '';
      if (day) days.add(day);
      employees.add(row.userId);

      summary.reservationCount += 1;
      summary.totalQuantity += row.quantity;
      summary.totalCost += amount;
      if (row.status === FoodReservationStatus.CONFIRMED) {
        summary.confirmedCount += 1;
        summary.confirmedQuantity += row.quantity;
        summary.confirmedCost += amount;
      } else {
        summary.pendingCount += 1;
        summary.pendingQuantity += row.quantity;
        summary.pendingCost += amount;
      }

      bumpCost(unitMap, row.orgUnitId, row.orgUnit.name, amount, row.quantity);
      bumpCost(
        restaurantMap,
        row.restaurantId,
        row.restaurant.name,
        amount,
        row.quantity,
      );
      bumpFood(foodMap, row.foodId, row.food.name, amount, row.quantity, unitPrice);
      if (day) {
        bumpPeriod(dayMap, day, amount, row.quantity);
        bumpPeriod(weekMap, startOfIranWeekIso(day), amount, row.quantity);
        bumpPeriod(monthMap, day.slice(0, 7), amount, row.quantity);
      }
    }

    summary.uniqueDays = days.size;
    summary.uniqueEmployees = employees.size;
    summary.avgCostPerServing =
      summary.totalQuantity > 0 ? summary.totalCost / summary.totalQuantity : 0;
    summary.avgCostPerReservation =
      summary.reservationCount > 0
        ? summary.totalCost / summary.reservationCount
        : 0;
    summary.avgDailyCost =
      summary.uniqueDays > 0 ? summary.totalCost / summary.uniqueDays : 0;

    const byUnit = [...unitMap.values()].sort(byCost);
    const byFood = [...foodMap.values()]
      .map((item) => ({
        id: item.id,
        name: item.name,
        count: item.count,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        avgUnitPrice:
          item.quantity > 0 ? item.priceSum / item.quantity : 0,
        minUnitPrice: item.minUnitPrice,
        maxUnitPrice: item.maxUnitPrice,
      }))
      .sort(byCost);
    const byRestaurant = [...restaurantMap.values()].sort(byCost);
    const byAvgPrice = [...byFood].sort(
      (a, b) => b.avgUnitPrice - a.avgUnitPrice || b.totalPrice - a.totalPrice,
    );

    return {
      summary,
      extremes: {
        highestCostUnit: byUnit[0] ?? null,
        lowestCostUnit: byUnit.length ? byUnit[byUnit.length - 1] : null,
        mostExpensiveFood: byAvgPrice[0] ?? null,
        cheapestFood: byAvgPrice.length
          ? byAvgPrice[byAvgPrice.length - 1]
          : null,
        topSpendFood: byFood[0] ?? null,
        topSpendRestaurant: byRestaurant[0] ?? null,
      },
      byUnit,
      byFood,
      byRestaurant,
      byDay: [...dayMap.values()].sort(byPeriod),
      byWeek: [...weekMap.values()].sort(byPeriod),
      byMonth: [...monthMap.values()].sort(byPeriod),
    };
  }

  async findOne(id: string, userId?: string, mineOnly = false) {
    const item = await foodReservations(this.prisma).findUnique({
      where: { id },
      select: reservationSelect,
    });
    if (!item) {
      throw new NotFoundException('رزرو غذا یافت نشد');
    }
    if (mineOnly && item.userId !== userId) {
      throw new ForbiddenException('دسترسی به این رزرو مجاز نیست');
    }
    return withReservation(item);
  }

  async create(userId: string, dto: CreateFoodReservationDto, isAdmin = false) {
    const user = await this.requireEmployee(userId);
    const unitId = isAdmin && dto.orgUnitId ? dto.orgUnitId : user.orgUnitId;
    if (!unitId) {
      throw new BadRequestException('ابتدا واحد سازمانی شما باید مشخص شود');
    }
    const unit = await this.prisma.organizationUnit.findUnique({
      where: { id: unitId },
      select: { id: true, maxMeals: true, nutritionRepId: true },
    });
    if (!unit) {
      throw new BadRequestException('واحد سازمانی یافت نشد');
    }
    if (dto.reservedAt < todayIsoDateTehran()) {
      throw new BadRequestException(
        'رزرو فقط برای امروز و روزهای آینده امکان‌پذیر است',
      );
    }
    const linked = await this.prisma.organizationUnitRestaurant.findFirst({
      where: { unitId, restaurantId: dto.restaurantId },
    });
    if (!linked) {
      throw new BadRequestException(
        isAdmin
          ? 'این رستوران برای واحد انتخاب‌شده تعریف نشده است'
          : 'این رستوران برای واحد سازمانی شما تعریف نشده است',
      );
    }
    const menuItem = await this.prisma.restaurantMenuItem.findFirst({
      where: {
        restaurantId: dto.restaurantId,
        foodId: dto.foodId,
        offeredAt: parseIsoDate(dto.reservedAt),
      },
    });
    if (!menuItem) {
      throw new BadRequestException(
        'این غذا در برنامه غذایی این تاریخ نیست',
      );
    }
    if (!menuItem.isActive) {
      throw new BadRequestException('این غذا در برنامه غذایی رستوران غیرفعال است');
    }
    const canChooseQuantity = isAdmin || unit.nutritionRepId === user.id;
    const quantity = canChooseQuantity ? (dto.quantity ?? 1) : 1;
    if (!canChooseQuantity && dto.quantity != null && dto.quantity !== 1) {
      throw new BadRequestException('فقط نماینده واحد می‌تواند بیش از یک غذا رزرو کند');
    }
    const maxMeals = unit.maxMeals;
    if (maxMeals != null) {
      const used = await foodReservations(this.prisma).aggregate({
        where: {
          orgUnitId: unitId,
          reservedAt: parseIsoDate(dto.reservedAt),
        },
        _sum: { quantity: true },
      });
      const usedQty = used._sum.quantity ?? 0;
      if (usedQty + quantity > maxMeals) {
        throw new BadRequestException(
          'سقف تعداد غذای قابل سفارش این واحد برای این تاریخ تکمیل شده است',
        );
      }
    }
    const item = await foodReservations(this.prisma).create({
      data: {
        reservedAt: parseIsoDate(dto.reservedAt),
        restaurantId: dto.restaurantId,
        foodId: dto.foodId,
        userId,
        orgUnitId: unitId,
        quantity,
        unitPrice: menuItem.price,
        status: FoodReservationStatus.PENDING,
      },
      select: reservationSelect,
    });
    return withReservation(item);
  }

  async confirm(id: string) {
    const item = await this.findOne(id);
    if (item.status !== FoodReservationStatus.PENDING) {
      throw new ConflictException('این رزرو قبلاً تأیید شده است');
    }
    const updated = await foodReservations(this.prisma).update({
      where: { id },
      data: { status: FoodReservationStatus.CONFIRMED },
      select: reservationSelect,
    });
    return withReservation(updated);
  }

  async remove(id: string, userId?: string, mineOnly = false) {
    const item = await this.findOne(id, userId, mineOnly);
    if (item.status !== FoodReservationStatus.PENDING) {
      throw new ConflictException('فقط سفارش‌های تأییدنشده را می‌توان حذف کرد');
    }
    await foodReservations(this.prisma).delete({ where: { id } });
    return { ok: true };
  }

  private buildWhere(
    query: FindFoodReservationsQueryDto,
    userId?: string,
  ): Prisma.FoodReservationWhereInput {
    let reservedAt: Prisma.DateTimeFilter | Date | undefined;
    if (query.reservedAt) {
      reservedAt = parseIsoDate(query.reservedAt);
    } else if (query.reservedFrom || query.reservedTo) {
      reservedAt = {
        ...(query.reservedFrom ? { gte: parseIsoDate(query.reservedFrom) } : {}),
        ...(query.reservedTo ? { lte: parseIsoDate(query.reservedTo) } : {}),
      };
    }
    return {
      userId: query.mine ? userId : query.userId,
      orgUnitId: query.orgUnitId,
      restaurantId: query.restaurantId,
      foodId: query.foodId,
      status: query.status,
      reservedAt,
      OR: query.q
        ? [
            { user: { fullName: containsInsensitive(query.q) } },
            { food: { name: containsInsensitive(query.q) } },
            { restaurant: { name: containsInsensitive(query.q) } },
            { orgUnit: { name: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
  }

  private sortOrder(query: FindFoodReservationsQueryDto) {
    return resolveSortOrder<Prisma.FoodReservationOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        reservedAt: (dir) => ({ reservedAt: dir }),
        restaurant: (dir) => ({ restaurant: { name: dir } }),
        food: (dir) => ({ food: { name: dir } }),
        user: (dir) => ({ user: { fullName: dir } }),
        orgUnit: (dir) => ({ orgUnit: { name: dir } }),
        quantity: (dir) => ({ quantity: dir }),
        status: (dir) => ({ status: dir }),
      },
      [{ reservedAt: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    );
  }

  private isNutritionRep(user: {
    id: string;
    orgUnit: { nutritionRepId: string | null; maxMeals: number | null } | null;
  }) {
    return Boolean(user.orgUnit && user.orgUnit.nutritionRepId === user.id);
  }

  private async requireEmployee(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        orgUnitId: true,
        orgUnit: {
          select: { id: true, name: true, nutritionRepId: true, maxMeals: true },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
