import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { buildStyledExcelExport } from '../common/excel-export';
import { gregorianToJalali } from '../common/jalali-date';
import {
  eachIsoDateInclusive,
  iranWeekdayIndex,
  parseIsoDate,
  startOfIranWeekIso,
  todayIsoDateTehran,
  toIsoDateOnly,
} from '../common/iso-date';
import { getRequestLocale, isLtrLocale } from '../common/request-locale';
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
import { CreateFoodReservationBatchDto } from './dto/create-food-reservation-batch.dto';
import { CreateFoodReservationDto } from './dto/create-food-reservation.dto';
import { FindFoodReservationsQueryDto } from './dto/find-food-reservations-query.dto';
import { FoodReservationRangeActionDto } from './dto/food-reservation-range-action.dto';
import {
  FoodReservationLastQuantityQueryDto,
  FoodReservationMenuQueryDto,
  FoodReservationWeekMenuQueryDto,
} from './dto/food-reservation-menu-query.dto';
import { foodMealTypeLabel, resolveFoodMealType } from './food-meal-type';
import { MANAGEMENT_MEAL_PREFIX, STAFF_MEAL_PREFIX } from './restaurants.service';
import { MineFoodSummaryQueryDto } from './dto/mine-food-summary-query.dto';
import {
  bucketStart,
  defaultMineSummaryRange,
  eachBucket,
  mineSummaryGrain,
} from './mine-summary-range';

type Db = PrismaService | Prisma.TransactionClient;

function foodReservations(prisma: Db) {
  return (
    prisma as unknown as { foodReservation: Prisma.FoodReservationDelegate }
  ).foodReservation;
}

const reservationMenuItemSelect = {
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

const reservationSelect = {
  id: true,
  reservedAt: true,
  mealType: true,
  restaurantId: true,
  foodId: true,
  userId: true,
  orgUnitId: true,
  quantity: true,
  forGuest: true,
  unitPrice: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  restaurant: { select: { id: true, name: true, logoId: true } },
  food: { select: { id: true, name: true, photoId: true } },
  user: { select: { id: true, fullName: true } },
  orgUnit: { select: { id: true, name: true } },
  advancedOrder: {
    select: {
      employeeQuantity: true,
      managementQuantity: true,
      employeeGuestQuantity: true,
      managementGuestQuantity: true,
    },
  },
} satisfies Prisma.FoodReservationSelect;

type AdvancedOrderQty = {
  employeeQuantity: number;
  managementQuantity: number;
  employeeGuestQuantity: number;
  managementGuestQuantity: number;
};

function audienceQuantities(item: {
  quantity: number;
  forGuest: boolean;
  food: { name: string };
  advancedOrder?: AdvancedOrderQty | null;
}) {
  const order = item.advancedOrder;
  if (order) {
    if (item.food.name.startsWith(STAFF_MEAL_PREFIX)) {
      return { unitQuantity: order.employeeQuantity, guestQuantity: order.employeeGuestQuantity };
    }
    if (item.food.name.startsWith(MANAGEMENT_MEAL_PREFIX)) {
      return {
        unitQuantity: order.managementQuantity,
        guestQuantity: order.managementGuestQuantity,
      };
    }
    return {
      unitQuantity: order.employeeQuantity + order.managementQuantity,
      guestQuantity: order.employeeGuestQuantity + order.managementGuestQuantity,
    };
  }
  return {
    unitQuantity: item.forGuest ? 0 : item.quantity,
    guestQuantity: item.forGuest ? item.quantity : 0,
  };
}

function withReservation<
  T extends {
    reservedAt: Date;
    unitPrice: Prisma.Decimal;
    quantity: number;
    forGuest: boolean;
    food: { name: string };
    advancedOrder?: AdvancedOrderQty | null;
  },
>(item: T) {
  const { advancedOrder, ...rest } = item;
  return {
    ...rest,
    reservedAt: toIsoDateOnly(item.reservedAt),
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.unitPrice) * item.quantity,
    ...audienceQuantities(item),
  };
}

const EXCEL_DIGITS: Partial<Record<string, string>> = {
  fa: '۰۱۲۳۴۵۶۷۸۹',
  ur: '۰۱۲۳۴۵۶۷۸۹',
  ar: '٠١٢٣٤٥٦٧٨٩',
  hi: '०१२३४५६७८९',
};

function localizeExcelDigits(value: string) {
  const alphabet = EXCEL_DIGITS[getRequestLocale()];
  if (!alphabet) return value;
  return value.replace(/\d/g, (digit) => alphabet[Number(digit)] ?? digit);
}

export function formatExportDate(iso: string | null) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  if (isLtrLocale(getRequestLocale())) {
    return localizeExcelDigits(`${year}/${month}/${day}`);
  }
  const jalali = gregorianToJalali(year, month, day);
  return localizeExcelDigits(`${jalali.year}/${jalali.month}/${jalali.day}`);
}

function reservationStatusLabel(status: FoodReservationStatus) {
  return status === FoodReservationStatus.CONFIRMED ? 'تأییدشده' : 'تأییدنشده';
}

type CostGroup = {
  id: string;
  name: string;
  count: number;
  quantity: number;
  totalPrice: number;
};

type UnitCostGroup = CostGroup & {
  guestQuantity: number;
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

type GuestPeriodGroup = PeriodCostGroup & {
  guestQuantity: number;
};

function bumpUnitCost(
  map: Map<string, UnitCostGroup>,
  id: string,
  name: string,
  amount: number,
  quantity: number,
  forGuest: boolean,
) {
  const current = map.get(id) ?? {
    id,
    name,
    count: 0,
    quantity: 0,
    totalPrice: 0,
    guestQuantity: 0,
  };
  current.count += 1;
  current.quantity += quantity;
  current.totalPrice += amount;
  if (forGuest) current.guestQuantity += quantity;
  map.set(id, current);
}

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

function bumpGuestPeriod(
  map: Map<string, GuestPeriodGroup>,
  period: string,
  amount: number,
  quantity: number,
  forGuest: boolean,
) {
  const current = map.get(period) ?? {
    period,
    count: 0,
    quantity: 0,
    totalPrice: 0,
    guestQuantity: 0,
  };
  current.count += 1;
  current.quantity += quantity;
  current.totalPrice += amount;
  if (forGuest) current.guestQuantity += quantity;
  map.set(period, current);
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

function calendarPeriodKeys(iso: string, jalali: boolean) {
  const week = startOfIranWeekIso(iso);
  if (!jalali) {
    return { week, month: iso.slice(0, 7), year: iso.slice(0, 4) };
  }
  const [gy, gm, gd] = iso.split('-').map(Number);
  const jalaliDate = gregorianToJalali(gy, gm, gd);
  return {
    week,
    month: `${jalaliDate.year}-${String(jalaliDate.month).padStart(2, '0')}`,
    year: String(jalaliDate.year),
  };
}

@Injectable()
export class FoodReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  async context(userId: string, canManage = false) {
    const user = await this.requireEmployee(userId);
    if (canManage) {
      const [units, restaurantRows] = await Promise.all([
        this.prisma.organizationUnit.findMany({
          select: {
            id: true,
            name: true,
            parentId: true,
            maxMeals: true,
            guestMealsEnabled: true,
            maxGuestMeals: true,
            restaurants: {
              select: {
                restaurant: { select: { id: true, name: true, logoId: true } },
              },
            },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        this.prisma.restaurant.findMany({
          select: { id: true, name: true, logoId: true },
        }),
      ]);
      const paths = buildOrganizationUnitPaths(units);
      const restaurants = [...restaurantRows].sort(
        (a, b) => a.name.localeCompare(b.name, 'fa') || a.id.localeCompare(b.id),
      );
      return {
        orgUnit: user.orgUnit,
        isNutritionRep: this.isNutritionRep(user),
        canManage: true,
        restaurants,
        units: units.map((unit) => ({
          id: unit.id,
          name: unit.name,
          pathLabel: paths.get(unit.id) ?? unit.name,
          maxMeals: unit.maxMeals,
          guestMealsEnabled: unit.guestMealsEnabled,
          maxGuestMeals: unit.maxGuestMeals,
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
    canManage = false,
  ) {
    const user = await this.requireEmployee(userId);
    const unitId = canManage && query.orgUnitId ? query.orgUnitId : user.orgUnitId;
    if (!unitId) return { quantity: null };
    const forGuest = query.forGuest === true;
    const mealType = resolveFoodMealType(query.mealType);
    const matched = await this.findLastQuantity(unitId, {
      restaurantId: query.restaurantId,
      foodId: query.foodId,
      mealType,
      forGuest,
    });
    if (matched != null) return { quantity: matched };
    if (!query.restaurantId && !query.foodId) return { quantity: null };
    const unitLast = await this.findLastQuantity(unitId, { mealType, forGuest });
    return { quantity: unitLast };
  }

  private async findLastQuantity(
    unitId: string,
    filter: {
      restaurantId?: string;
      foodId?: string;
      mealType: ReturnType<typeof resolveFoodMealType>;
      forGuest: boolean;
    },
  ) {
    const last = await foodReservations(this.prisma).findFirst({
      where: {
        orgUnitId: unitId,
        restaurantId: filter.restaurantId,
        foodId: filter.foodId,
        mealType: filter.mealType,
        forGuest: filter.forGuest,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { quantity: true },
    });
    return last?.quantity ?? null;
  }

  async menu(userId: string, query: FoodReservationMenuQueryDto, canManage = false) {
    await this.requireLinkedRestaurant(
      userId,
      query.restaurantId,
      query.orgUnitId,
      canManage,
    );
    const items = await this.prisma.restaurantMenuItem.findMany({
      where: {
        restaurantId: query.restaurantId,
        isActive: true,
        weekday: iranWeekdayIndex(query.offeredAt),
      },
      orderBy: [{ food: { name: 'asc' } }, { id: 'asc' }],
      select: reservationMenuItemSelect,
    });
    return items.map((item) => ({
      ...item,
      price: Number(item.price),
    }));
  }

  async weekMenu(
    userId: string,
    query: FoodReservationWeekMenuQueryDto,
    canManage = false,
  ) {
    await this.requireLinkedRestaurant(
      userId,
      query.restaurantId,
      query.orgUnitId,
      canManage,
    );
    const items = await this.prisma.restaurantMenuItem.findMany({
      where: {
        restaurantId: query.restaurantId,
        isActive: true,
      },
      orderBy: [{ weekday: 'asc' }, { food: { name: 'asc' } }, { id: 'asc' }],
      select: reservationMenuItemSelect,
    });
    return items.map((item) => ({
      ...item,
      price: Number(item.price),
    }));
  }

  private async requireLinkedRestaurant(
    userId: string,
    restaurantId: string,
    _orgUnitId: string | undefined,
    canManage: boolean,
  ) {
    const user = await this.requireEmployee(userId);
    if (canManage) return;
    const unitId = user.orgUnitId;
    if (!unitId) {
      throw new BadRequestException('ابتدا واحد سازمانی شما باید مشخص شود');
    }
    const linked = await this.prisma.organizationUnitRestaurant.findFirst({
      where: { unitId, restaurantId },
      select: { unitId: true },
    });
    if (!linked) {
      throw new BadRequestException(
        'این رستوران برای واحد سازمانی شما تعریف نشده است',
      );
    }
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

  async exportAll(query: FindFoodReservationsQueryDto, userId?: string) {
    if (query.mine && !userId) {
      throw new UnauthorizedException();
    }
    const items = await foodReservations(this.prisma).findMany({
      where: this.buildWhere(query, userId),
      orderBy: this.sortOrder(query),
      select: reservationSelect,
    });
    const mine = Boolean(query.mine);
    const sheetName = mine ? 'سفارش‌های من' : 'تاریخچه رزرو';
    return buildStyledExcelExport({
      sheetName,
      fileName: mine ? 'سفارش‌های-من.xlsx' : 'تاریخچه-رزرو-غذا.xlsx',
      columns: mine
        ? [
            { header: 'تاریخ رزرو', key: 'reservedAt', width: 16 },
            { header: 'وعده', key: 'mealType', width: 12 },
            { header: 'رستوران', key: 'restaurant', width: 22 },
            { header: 'غذا', key: 'food', width: 22 },
            { header: 'تعداد', key: 'quantity', width: 12 },
            { header: 'برای', key: 'audience', width: 14 },
            { header: 'وضعیت', key: 'status', width: 16 },
          ]
        : [
            { header: 'تاریخ رزرو', key: 'reservedAt', width: 16 },
            { header: 'وعده', key: 'mealType', width: 12 },
            { header: 'سفارش‌دهنده', key: 'employee', width: 24 },
            { header: 'واحد سازمانی', key: 'orgUnit', width: 24 },
            { header: 'رستوران', key: 'restaurant', width: 22 },
            { header: 'غذا', key: 'food', width: 22 },
            { header: 'تعداد', key: 'quantity', width: 12 },
            { header: 'برای', key: 'audience', width: 14 },
            { header: 'وضعیت', key: 'status', width: 16 },
          ],
      rows: items.map((item) => ({
        reservedAt: formatExportDate(toIsoDateOnly(item.reservedAt)),
        mealType: foodMealTypeLabel(item.mealType),
        employee: item.user.fullName,
        orgUnit: item.orgUnit.name,
        restaurant: item.restaurant.name,
        food: item.food.name,
        quantity: item.quantity,
        audience: item.forGuest ? 'مهمان' : 'واحد',
        status: reservationStatusLabel(item.status),
      })),
    });
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
          forGuest: true,
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
      {
        id: string;
        name: string;
        count: number;
        quantity: number;
        guestQuantity: number;
        totalPrice: number;
      }
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
        guestQuantity: 0,
        totalPrice: 0,
      };
      unit.count += 1;
      unit.quantity += row.quantity;
      if (row.forGuest) unit.guestQuantity += row.quantity;
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

  async unitReport(query: FindFoodReservationsQueryDto) {
    const jalali = !isLtrLocale(getRequestLocale());
    let unit: { id: string; name: string } | null = null;
    if (query.orgUnitId) {
      const found = await this.prisma.organizationUnit.findUnique({
        where: { id: query.orgUnitId },
        select: { id: true, name: true },
      });
      if (!found) {
        throw new BadRequestException('واحد سازمانی یافت نشد');
      }
      unit = found;
    }

    const where = this.buildWhere({
      orgUnitId: query.orgUnitId,
      reservedFrom: query.reservedFrom,
      reservedTo: query.reservedTo,
    });
    const rows = await foodReservations(this.prisma).findMany({
      where,
      select: {
        reservedAt: true,
        quantity: true,
        forGuest: true,
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
      reservationCount: 0,
      totalQuantity: 0,
      guestQuantity: 0,
      totalCost: 0,
      confirmedCount: 0,
      confirmedQuantity: 0,
      confirmedCost: 0,
      pendingCount: 0,
      pendingQuantity: 0,
      pendingCost: 0,
      avgCostPerServing: 0,
      avgCostPerReservation: 0,
      avgDailyCost: 0,
      uniqueDays: 0,
      uniqueEmployees: 0,
      uniqueUnits: 0,
      uniqueRestaurants: 0,
    };
    const unitMap = new Map<string, UnitCostGroup>();
    const restaurantMap = new Map<string, UnitCostGroup>();
    const foodMap = new Map<string, UnitCostGroup>();
    const weekMap = new Map<string, GuestPeriodGroup>();
    const monthMap = new Map<string, GuestPeriodGroup>();
    const yearMap = new Map<string, GuestPeriodGroup>();
    const days = new Set<string>();
    const employees = new Set<string>();

    for (const row of rows) {
      const amount = Number(row.unitPrice) * row.quantity;
      const day = toIsoDateOnly(row.reservedAt) ?? '';
      if (day) days.add(day);
      employees.add(row.userId);

      summary.reservationCount += 1;
      summary.totalQuantity += row.quantity;
      if (row.forGuest) summary.guestQuantity += row.quantity;
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

      bumpUnitCost(
        unitMap,
        row.orgUnitId,
        row.orgUnit.name,
        amount,
        row.quantity,
        row.forGuest,
      );
      bumpUnitCost(
        restaurantMap,
        row.restaurantId,
        row.restaurant.name,
        amount,
        row.quantity,
        row.forGuest,
      );
      bumpUnitCost(foodMap, row.foodId, row.food.name, amount, row.quantity, row.forGuest);
      if (day) {
        const keys = calendarPeriodKeys(day, jalali);
        bumpGuestPeriod(weekMap, keys.week, amount, row.quantity, row.forGuest);
        bumpGuestPeriod(monthMap, keys.month, amount, row.quantity, row.forGuest);
        bumpGuestPeriod(yearMap, keys.year, amount, row.quantity, row.forGuest);
      }
    }

    summary.uniqueDays = days.size;
    summary.uniqueEmployees = employees.size;
    summary.uniqueUnits = unitMap.size;
    summary.uniqueRestaurants = restaurantMap.size;
    summary.avgCostPerServing =
      summary.totalQuantity > 0 ? summary.totalCost / summary.totalQuantity : 0;
    summary.avgCostPerReservation =
      summary.reservationCount > 0
        ? summary.totalCost / summary.reservationCount
        : 0;
    summary.avgDailyCost =
      summary.uniqueDays > 0 ? summary.totalCost / summary.uniqueDays : 0;

    return {
      scope: unit ? 'unit' : 'all',
      calendar: jalali ? 'jalali' : 'gregorian',
      unit,
      reservedFrom: query.reservedFrom ?? null,
      reservedTo: query.reservedTo ?? null,
      summary,
      byUnit: [...unitMap.values()].sort(byCost),
      byFood: [...foodMap.values()].sort(byCost),
      byRestaurant: [...restaurantMap.values()].sort(byCost),
      byWeek: [...weekMap.values()].sort(byPeriod),
      byMonth: [...monthMap.values()].sort(byPeriod),
      byYear: [...yearMap.values()].sort(byPeriod),
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
    if (item.advancedOrder) {
      return withReservation(item);
    }
    const siblings = await foodReservations(this.prisma).findMany({
      where: {
        reservedAt: item.reservedAt,
        mealType: item.mealType,
        restaurantId: item.restaurantId,
        foodId: item.foodId,
        orgUnitId: item.orgUnitId,
        userId: item.userId,
      },
      select: { quantity: true, forGuest: true },
    });
    let unitQuantity = 0;
    let guestQuantity = 0;
    for (const row of siblings) {
      if (row.forGuest) guestQuantity += row.quantity;
      else unitQuantity += row.quantity;
    }
    return { ...withReservation(item), unitQuantity, guestQuantity };
  }

  async create(
    userId: string,
    dto: CreateFoodReservationDto,
    canManage = false,
    db: Db = this.prisma,
  ) {
    const user = await this.requireEmployee(userId);
    const unitId = canManage && dto.orgUnitId ? dto.orgUnitId : user.orgUnitId;
    if (!unitId) {
      throw new BadRequestException('ابتدا واحد سازمانی شما باید مشخص شود');
    }
    const unit = await db.organizationUnit.findUnique({
      where: { id: unitId },
      select: {
        id: true,
        maxMeals: true,
        nutritionRepId: true,
        guestMealsEnabled: true,
        maxGuestMeals: true,
      },
    });
    if (!unit) {
      throw new BadRequestException('واحد سازمانی یافت نشد');
    }
    if (!canManage && dto.reservedAt < todayIsoDateTehran()) {
      throw new BadRequestException(
        'رزرو فقط برای امروز و روزهای آینده امکان‌پذیر است',
      );
    }
    if (canManage) {
      const restaurant = await db.restaurant.findUnique({
        where: { id: dto.restaurantId },
        select: { id: true },
      });
      if (!restaurant) {
        throw new BadRequestException('رستوران یافت نشد');
      }
    } else {
      const linked = await db.organizationUnitRestaurant.findFirst({
        where: { unitId, restaurantId: dto.restaurantId },
      });
      if (!linked) {
        throw new BadRequestException('این رستوران برای واحد سازمانی شما تعریف نشده است');
      }
    }
    const menuItem = await db.restaurantMenuItem.findFirst({
      where: {
        restaurantId: dto.restaurantId,
        foodId: dto.foodId,
        weekday: iranWeekdayIndex(dto.reservedAt),
      },
    });
    if (!menuItem) {
      throw new BadRequestException(
        'این غذا در برنامه غذایی این روز هفته نیست',
      );
    }
    if (!menuItem.isActive) {
      throw new BadRequestException('این غذا در برنامه غذایی رستوران غیرفعال است');
    }
    const canChooseQuantity = canManage || unit.nutritionRepId === user.id;
    const forGuest = dto.forGuest === true;
    const quantity = canChooseQuantity ? (dto.quantity ?? 1) : 1;
    if (!canChooseQuantity && dto.quantity != null && dto.quantity !== 1) {
      throw new BadRequestException('فقط نماینده واحد می‌تواند بیش از یک غذا رزرو کند');
    }
    if (forGuest && !canChooseQuantity) {
      throw new BadRequestException('فقط نماینده واحد می‌تواند برای مهمان سفارش ثبت کند');
    }
    if (forGuest && !unit.guestMealsEnabled) {
      throw new BadRequestException('سفارش غذای مهمان برای این واحد فعال نیست');
    }
    const mealType = resolveFoodMealType(dto.mealType);
    const cap = forGuest ? unit.maxGuestMeals : unit.maxMeals;
    if (cap != null) {
      const used = await foodReservations(db).aggregate({
        where: {
          orgUnitId: unitId,
          reservedAt: parseIsoDate(dto.reservedAt),
          mealType,
          forGuest,
        },
        _sum: { quantity: true },
      });
      const usedQty = used._sum.quantity ?? 0;
      if (usedQty + quantity > cap) {
        throw new BadRequestException(
          forGuest
            ? 'سقف تعداد غذای مهمان این واحد برای این تاریخ تکمیل شده است'
            : 'سقف تعداد غذای قابل سفارش این واحد برای این تاریخ تکمیل شده است',
        );
      }
    }
    const item = await foodReservations(db).create({
      data: {
        reservedAt: parseIsoDate(dto.reservedAt),
        mealType,
        restaurantId: dto.restaurantId,
        foodId: dto.foodId,
        userId,
        orgUnitId: unitId,
        quantity,
        forGuest,
        unitPrice: menuItem.price,
        status: canManage ? FoodReservationStatus.CONFIRMED : FoodReservationStatus.PENDING,
      },
      select: reservationSelect,
    });
    return withReservation(item);
  }

  /** چند غذا (واحد و مهمان) را در یک تراکنش ثبت می‌کند. */
  async createBatch(
    userId: string,
    dto: CreateFoodReservationBatchDto,
    canManage = false,
  ) {
    const seen = new Set<string>();
    for (const item of dto.items) {
      const key = `${item.foodId}|${item.forGuest === true}`;
      if (seen.has(key)) {
        throw new BadRequestException('سفارش تکراری برای یک غذا ثبت شده است');
      }
      seen.add(key);
    }
    return this.prisma.$transaction(
      async (tx) => {
        const created = [];
        for (const item of dto.items) {
          created.push(
            await this.create(
              userId,
              {
                reservedAt: dto.reservedAt,
                orgUnitId: dto.orgUnitId,
                restaurantId: dto.restaurantId,
                mealType: dto.mealType,
                foodId: item.foodId,
                quantity: item.quantity,
                forGuest: item.forGuest,
              },
              canManage,
              tx,
            ),
          );
        }
        return created;
      },
      { timeout: 20000 },
    );
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

  async confirmRange(dto: FoodReservationRangeActionDto) {
    const result = await foodReservations(this.prisma).updateMany({
      where: this.rangeWhere(dto, FoodReservationStatus.PENDING),
      data: { status: FoodReservationStatus.CONFIRMED },
    });
    return { count: result.count };
  }

  async cancelRange(dto: FoodReservationRangeActionDto) {
    const result = await foodReservations(this.prisma).deleteMany({
      where: this.rangeWhere(
        dto,
        dto.includeConfirmed ? undefined : FoodReservationStatus.PENDING,
      ),
    });
    return { count: result.count };
  }

  async deleteAll() {
    const result = await foodReservations(this.prisma).deleteMany({});
    return { count: result.count };
  }

  private rangeWhere(
    dto: FoodReservationRangeActionDto,
    status?: FoodReservationStatus,
  ): Prisma.FoodReservationWhereInput {
    const start = dto.reservedFrom;
    const end = dto.reservedTo || dto.reservedFrom;
    if (end < start) {
      throw new BadRequestException('تاریخ پایان نباید قبل از تاریخ شروع باشد');
    }
    if (eachIsoDateInclusive(start, end).length > 366) {
      throw new BadRequestException('بازه زمانی بیش از حد طولانی است');
    }
    return {
      reservedAt: {
        gte: parseIsoDate(start),
        lte: parseIsoDate(end),
      },
      orgUnitId: dto.orgUnitId,
      restaurantId: dto.restaurantId,
      status,
    };
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
      mealType: query.mealType,
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
        mealType: (dir) => ({ mealType: dir }),
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
          select: {
            id: true,
            name: true,
            nutritionRepId: true,
            maxMeals: true,
            guestMealsEnabled: true,
            maxGuestMeals: true,
          },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
