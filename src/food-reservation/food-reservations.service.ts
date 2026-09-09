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
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import { FoodReservationStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFoodReservationDto } from './dto/create-food-reservation.dto';
import { FindFoodReservationsQueryDto } from './dto/find-food-reservations-query.dto';

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

  async context(userId: string) {
    const user = await this.requireEmployee(userId);
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
      restaurants,
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

  async create(userId: string, dto: CreateFoodReservationDto) {
    const user = await this.requireEmployee(userId);
    if (!user.orgUnitId || !user.orgUnit) {
      throw new BadRequestException('ابتدا واحد سازمانی شما باید مشخص شود');
    }
    if (dto.reservedAt < todayIsoDateTehran()) {
      throw new BadRequestException(
        'رزرو فقط برای امروز و روزهای آینده امکان‌پذیر است',
      );
    }
    const linked = await this.prisma.organizationUnitRestaurant.findFirst({
      where: { unitId: user.orgUnitId, restaurantId: dto.restaurantId },
    });
    if (!linked) {
      throw new BadRequestException(
        'این رستوران برای واحد سازمانی شما تعریف نشده است',
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
    const isRep = this.isNutritionRep(user);
    const quantity = isRep ? (dto.quantity ?? 1) : 1;
    if (!isRep && dto.quantity != null && dto.quantity !== 1) {
      throw new BadRequestException('فقط نماینده واحد می‌تواند بیش از یک غذا رزرو کند');
    }
    const item = await foodReservations(this.prisma).create({
      data: {
        reservedAt: parseIsoDate(dto.reservedAt),
        restaurantId: dto.restaurantId,
        foodId: dto.foodId,
        userId,
        orgUnitId: user.orgUnitId,
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
    orgUnit: { nutritionRepId: string | null } | null;
  }) {
    return Boolean(user.orgUnit && user.orgUnit.nutritionRepId === user.id);
  }

  private async requireEmployee(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        orgUnitId: true,
        orgUnit: { select: { id: true, name: true, nutritionRepId: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
