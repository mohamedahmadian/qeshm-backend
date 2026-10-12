import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { gregorianToJalali } from '../common/jalali-date';
import {
  eachIsoDateInclusive,
  iranWeekdayIndex,
  parseIsoDate,
  toIsoDateOnly,
} from '../common/iso-date';
import {
  containsInsensitive,
  paginatedResult,
  paginationArgs,
  PaginationQueryDto,
  wantsPagination,
} from '../common/pagination';
import { resolveSortOrder } from '../common/sort-query';
import {
  FoodReservationStatus,
  Prisma,
} from '../generated/prisma/client';
import { buildOrganizationUnitPaths } from '../organization/organization-unit-tree';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdvancedFoodOrderDto } from './dto/create-advanced-food-order.dto';
import { FindAdvancedFoodOrdersQueryDto } from './dto/find-advanced-food-orders-query.dto';
import {
  MANAGEMENT_MEAL_PREFIX,
  RestaurantsService,
  STAFF_MEAL_PREFIX,
} from './restaurants.service';

const orderSelect = {
  id: true,
  orgUnitId: true,
  restaurantId: true,
  source: true,
  startsOn: true,
  endsOn: true,
  weekdays: true,
  foodLabel: true,
  employeeQuantity: true,
  managementQuantity: true,
  employeeUnitPrice: true,
  managementUnitPrice: true,
  createdAt: true,
  updatedAt: true,
  orgUnit: { select: { id: true, name: true } },
  restaurant: { select: { id: true, name: true } },
  _count: { select: { reservations: true } },
} satisfies Prisma.AdvancedFoodOrderSelect;

const reservationLineSelect = {
  id: true,
  reservedAt: true,
  quantity: true,
  unitPrice: true,
  status: true,
  food: { select: { id: true, name: true } },
} satisfies Prisma.FoodReservationSelect;

type OrderRow = Prisma.AdvancedFoodOrderGetPayload<{ select: typeof orderSelect }>;

type ReservationLineRow = Prisma.FoodReservationGetPayload<{
  select: typeof reservationLineSelect;
}>;

type DailyLine = {
  iso: string;
  foodId: string;
  foodName: string;
  quantity: number;
  unitPrice: number;
};

type MealFood = { id: string; name: string; price: number };

function presentOrder(row: OrderRow) {
  const { _count, employeeUnitPrice, managementUnitPrice, startsOn, endsOn, ...rest } = row;
  return {
    ...rest,
    startsOn: toIsoDateOnly(startsOn),
    endsOn: toIsoDateOnly(endsOn),
    employeeUnitPrice: employeeUnitPrice == null ? null : Number(employeeUnitPrice),
    managementUnitPrice:
      managementUnitPrice == null ? null : Number(managementUnitPrice),
    reservationCount: _count.reservations,
  };
}

function presentReservation(item: ReservationLineRow) {
  return {
    id: item.id,
    reservedAt: toIsoDateOnly(item.reservedAt),
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.unitPrice) * item.quantity,
    status: item.status,
    food: item.food,
  };
}

function formatFaDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  const jalali = gregorianToJalali(year, month, day);
  return `${jalali.year}/${jalali.month}/${jalali.day}`;
}

function joinDates(dates: string[]) {
  const shown = dates.slice(0, 8).map(formatFaDate).join('، ');
  if (dates.length <= 8) return shown;
  return `${shown} و ${dates.length - 8} روز دیگر`;
}

@Injectable()
export class AdvancedFoodOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly restaurants: RestaurantsService,
  ) {}

  async context() {
    const [units, restaurants] = await Promise.all([
      this.prisma.organizationUnit.findMany({
        select: { id: true, name: true, parentId: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.restaurant.findMany({
        select: {
          id: true,
          name: true,
          employeeMealPrice: true,
          managementMealPrice: true,
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const paths = buildOrganizationUnitPaths(units);
    return {
      units: units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        pathLabel: paths.get(unit.id) ?? unit.name,
      })),
      restaurants: restaurants.map((restaurant) => ({
        id: restaurant.id,
        name: restaurant.name,
        employeeMealPrice:
          restaurant.employeeMealPrice == null ? null : Number(restaurant.employeeMealPrice),
        managementMealPrice:
          restaurant.managementMealPrice == null
            ? null
            : Number(restaurant.managementMealPrice),
      })),
    };
  }

  async weekMenu(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true },
    });
    if (!restaurant) {
      throw new NotFoundException('رستوران یافت نشد');
    }
    const byDay = await this.dailyMenuFoods(restaurant.id, restaurant.name);
    return Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      foods: (byDay.get(weekday) ?? []).map((food) => ({
        id: food.id,
        name: food.name,
        price: food.price,
      })),
    }));
  }

  async findAll(query: FindAdvancedFoodOrdersQueryDto) {
    const where: Prisma.AdvancedFoodOrderWhereInput = {
      OR: query.q
        ? [
            { foodLabel: containsInsensitive(query.q) },
            { orgUnit: { name: containsInsensitive(query.q) } },
            { restaurant: { name: containsInsensitive(query.q) } },
          ]
        : undefined,
    };
    const orderBy = resolveSortOrder<Prisma.AdvancedFoodOrderOrderByWithRelationInput>(
      query.sortBy,
      query.sortDir,
      {
        createdAt: (dir) => ({ createdAt: dir }),
        orgUnit: (dir) => ({ orgUnit: { name: dir } }),
        restaurant: (dir) => ({ restaurant: { name: dir } }),
        startsOn: (dir) => ({ startsOn: dir }),
        endsOn: (dir) => ({ endsOn: dir }),
        food: (dir) => ({ foodLabel: dir }),
        employeeQuantity: (dir) => ({ employeeQuantity: dir }),
        managementQuantity: (dir) => ({ managementQuantity: dir }),
      },
      [{ createdAt: 'desc' }, { id: 'asc' }],
    );
    if (!wantsPagination(query)) {
      const rows = await this.prisma.advancedFoodOrder.findMany({
        where,
        orderBy,
        select: orderSelect,
      });
      return rows.map(presentOrder);
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const [items, total] = await Promise.all([
      this.prisma.advancedFoodOrder.findMany({
        where,
        orderBy,
        skip,
        take,
        select: orderSelect,
      }),
      this.prisma.advancedFoodOrder.count({ where }),
    ]);
    return paginatedResult(items.map(presentOrder), total, page, pageSize);
  }

  async findOne(id: string) {
    const row = await this.prisma.advancedFoodOrder.findUnique({
      where: { id },
      select: orderSelect,
    });
    if (!row) {
      throw new NotFoundException('سفارش پیشرفته غذا یافت نشد');
    }
    return presentOrder(row);
  }

  async findReservations(id: string, query: PaginationQueryDto) {
    const order = await this.prisma.advancedFoodOrder.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!order) {
      throw new NotFoundException('سفارش پیشرفته غذا یافت نشد');
    }
    const { page, pageSize, skip, take } = paginationArgs(query);
    const where: Prisma.FoodReservationWhereInput = { advancedOrderId: id };
    const [items, total] = await Promise.all([
      this.prisma.foodReservation.findMany({
        where,
        orderBy: [{ reservedAt: 'asc' }, { food: { name: 'asc' } }, { id: 'asc' }],
        skip,
        take,
        select: reservationLineSelect,
      }),
      this.prisma.foodReservation.count({ where }),
    ]);
    return paginatedResult(items.map(presentReservation), total, page, pageSize);
  }

  async create(userId: string, dto: CreateAdvancedFoodOrderDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    if (dto.endsOn < dto.startsOn) {
      throw new BadRequestException('تاریخ پایان نباید قبل از تاریخ شروع باشد');
    }
    const span = eachIsoDateInclusive(dto.startsOn, dto.endsOn);
    if (span.length > 366) {
      throw new BadRequestException('بازه زمانی بیش از یک سال است');
    }
    const selectedDays = new Set(dto.weekdays);
    const dates = span.filter((iso) => selectedDays.has(iranWeekdayIndex(iso)));
    if (!dates.length) {
      throw new BadRequestException('در این بازه هیچ‌کدام از روزهای انتخاب‌شده وجود ندارد');
    }
    if (dto.employeeQuantity + dto.managementQuantity < 1) {
      throw new BadRequestException(
        'حداقل تعداد غذای کارمندی یا مدیریتی باید بیشتر از صفر باشد',
      );
    }
    const unit = await this.prisma.organizationUnit.findUnique({
      where: { id: dto.orgUnitId },
      select: { id: true, maxMeals: true },
    });
    if (!unit) {
      throw new BadRequestException('واحد سازمانی یافت نشد');
    }
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: dto.restaurantId },
      select: {
        id: true,
        name: true,
        employeeMealPrice: true,
        managementMealPrice: true,
      },
    });
    if (!restaurant) {
      throw new BadRequestException('رستوران یافت نشد');
    }
    if (dto.source === 'DEFAULT') {
      this.assertDefaultPrices(dto);
    }

    const menuLines = dto.source === 'MENU' ? await this.menuLines(restaurant, dates, dto) : null;
    await this.assertWithinMealCap(
      unit.id,
      unit.maxMeals,
      dto.startsOn,
      dto.endsOn,
      menuLines ?? this.defaultQuantityLines(dates, dto),
    );

    const created = await this.prisma.$transaction(
      async (tx) => {
        const lines =
          dto.source === 'DEFAULT'
            ? await this.defaultLines(tx, restaurant, dates, dto)
            : menuLines ?? [];
        const foodLabel = [...new Set(lines.map((line) => line.foodName))].join('، ').slice(0, 500);
        const order = await tx.advancedFoodOrder.create({
          data: {
            orgUnitId: dto.orgUnitId,
            restaurantId: dto.restaurantId,
            source: dto.source,
            startsOn: parseIsoDate(dto.startsOn),
            endsOn: parseIsoDate(dto.endsOn),
            weekdays: dto.weekdays,
            foodLabel,
            employeeQuantity: dto.employeeQuantity,
            managementQuantity: dto.managementQuantity,
            employeeUnitPrice:
              dto.source === 'DEFAULT' && dto.employeeQuantity > 0
                ? new Prisma.Decimal(dto.employeeUnitPrice ?? 0)
                : null,
            managementUnitPrice:
              dto.source === 'DEFAULT' && dto.managementQuantity > 0
                ? new Prisma.Decimal(dto.managementUnitPrice ?? 0)
                : null,
            createdById: userId,
          },
          select: { id: true },
        });
        await tx.foodReservation.createMany({
          data: lines.map((line) => ({
            reservedAt: parseIsoDate(line.iso),
            restaurantId: dto.restaurantId,
            foodId: line.foodId,
            userId,
            orgUnitId: dto.orgUnitId,
            quantity: line.quantity,
            unitPrice: new Prisma.Decimal(line.unitPrice),
            status: FoodReservationStatus.PENDING,
            advancedOrderId: order.id,
          })),
        });
        return tx.advancedFoodOrder.findUniqueOrThrow({
          where: { id: order.id },
          select: orderSelect,
        });
      },
      { timeout: 20000 },
    );
    return presentOrder(created);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.advancedFoodOrder.delete({ where: { id } });
    return { ok: true };
  }

  private assertDefaultPrices(dto: CreateAdvancedFoodOrderDto) {
    if (dto.employeeQuantity > 0 && dto.employeeUnitPrice == null) {
      throw new BadRequestException('قیمت غذای کارمندی را وارد کنید');
    }
    if (dto.managementQuantity > 0 && dto.managementUnitPrice == null) {
      throw new BadRequestException('قیمت غذای مدیریتی را وارد کنید');
    }
  }

  /** فقط برای کنترل سقف؛ شناسه غذا بعداً داخل تراکنش ساخته یا پیدا می‌شود. */
  private defaultQuantityLines(dates: string[], dto: CreateAdvancedFoodOrderDto): DailyLine[] {
    const lines: DailyLine[] = [];
    for (const iso of dates) {
      if (dto.employeeQuantity > 0) {
        lines.push({
          iso,
          foodId: '',
          foodName: '',
          quantity: dto.employeeQuantity,
          unitPrice: dto.employeeUnitPrice ?? 0,
        });
      }
      if (dto.managementQuantity > 0) {
        lines.push({
          iso,
          foodId: '',
          foodName: '',
          quantity: dto.managementQuantity,
          unitPrice: dto.managementUnitPrice ?? 0,
        });
      }
    }
    return lines;
  }

  private async defaultLines(
    tx: Prisma.TransactionClient,
    restaurant: {
      id: string;
      name: string;
      employeeMealPrice: Prisma.Decimal | null;
      managementMealPrice: Prisma.Decimal | null;
    },
    dates: string[],
    dto: CreateAdvancedFoodOrderDto,
  ) {
    const staffName = `${STAFF_MEAL_PREFIX}${restaurant.name}`;
    const managementName = `${MANAGEMENT_MEAL_PREFIX}${restaurant.name}`;
    let staff: { id: string; name: string } | null = null;
    let management: { id: string; name: string } | null = null;
    const restaurantPrices: Prisma.RestaurantUpdateInput = {};
    if (dto.employeeQuantity > 0) {
      const price = dto.employeeUnitPrice ?? 0;
      const id = await this.restaurants.provisionStandardMeal(tx, restaurant.id, staffName, price);
      staff = { id, name: staffName };
      if (restaurant.employeeMealPrice == null) {
        restaurantPrices.employeeMealPrice = new Prisma.Decimal(price);
      }
    }
    if (dto.managementQuantity > 0) {
      const price = dto.managementUnitPrice ?? 0;
      const id = await this.restaurants.provisionStandardMeal(
        tx,
        restaurant.id,
        managementName,
        price,
      );
      management = { id, name: managementName };
      if (restaurant.managementMealPrice == null) {
        restaurantPrices.managementMealPrice = new Prisma.Decimal(price);
      }
    }
    if (Object.keys(restaurantPrices).length) {
      await tx.restaurant.update({
        where: { id: restaurant.id },
        data: restaurantPrices,
      });
    }
    const lines: DailyLine[] = [];
    for (const iso of dates) {
      if (dto.employeeQuantity > 0 && staff) {
        lines.push({
          iso,
          foodId: staff.id,
          foodName: staff.name,
          quantity: dto.employeeQuantity,
          unitPrice: dto.employeeUnitPrice ?? 0,
        });
      }
      if (dto.managementQuantity > 0 && management) {
        lines.push({
          iso,
          foodId: management.id,
          foodName: management.name,
          quantity: dto.managementQuantity,
          unitPrice: dto.managementUnitPrice ?? 0,
        });
      }
    }
    return lines;
  }

  private async menuLines(
    restaurant: { id: string; name: string },
    dates: string[],
    dto: CreateAdvancedFoodOrderDto,
  ) {
    const byDay = await this.dailyMenuFoods(restaurant.id, restaurant.name);
    const missing: string[] = [];
    const multiple: string[] = [];
    const lines: DailyLine[] = [];
    const quantity = dto.employeeQuantity + dto.managementQuantity;
    for (const iso of dates) {
      const foods = byDay.get(iranWeekdayIndex(iso)) ?? [];
      if (foods.length === 0) {
        missing.push(iso);
        continue;
      }
      if (foods.length > 1) {
        multiple.push(iso);
        continue;
      }
      const food = foods[0];
      lines.push({
        iso,
        foodId: food.id,
        foodName: food.name,
        quantity,
        unitPrice: food.price,
      });
    }
    if (missing.length) {
      throw new BadRequestException(
        `برای این روزها در منوی روزانه رستوران غذایی ثبت نشده است: ${joinDates(missing)}`,
      );
    }
    if (multiple.length) {
      throw new BadRequestException(
        `برای این روزها بیش از یک غذا در منوی روزانه است. هر روز باید فقط یک غذا به‌جز غذای پیش‌فرض داشته باشد: ${joinDates(multiple)}`,
      );
    }
    return lines;
  }

  private async dailyMenuFoods(restaurantId: string, restaurantName: string) {
    const staffName = `${STAFF_MEAL_PREFIX}${restaurantName}`;
    const managementName = `${MANAGEMENT_MEAL_PREFIX}${restaurantName}`;
    const items = await this.prisma.restaurantMenuItem.findMany({
      where: { restaurantId, isActive: true },
      select: {
        weekday: true,
        price: true,
        food: { select: { id: true, name: true } },
      },
      orderBy: [{ food: { name: 'asc' } }, { id: 'asc' }],
    });
    const byDay = new Map<number, MealFood[]>();
    for (const item of items) {
      if (item.food.name === staffName || item.food.name === managementName) continue;
      const list = byDay.get(item.weekday) ?? [];
      list.push({
        id: item.food.id,
        name: item.food.name,
        price: Number(item.price),
      });
      byDay.set(item.weekday, list);
    }
    return byDay;
  }

  private async assertWithinMealCap(
    orgUnitId: string,
    maxMeals: number | null,
    startsOn: string,
    endsOn: string,
    lines: DailyLine[],
  ) {
    if (maxMeals == null) return;
    const perDay = new Map<string, number>();
    for (const line of lines) {
      perDay.set(line.iso, (perDay.get(line.iso) ?? 0) + line.quantity);
    }
    const existing = await this.prisma.foodReservation.groupBy({
      by: ['reservedAt'],
      where: {
        orgUnitId,
        reservedAt: {
          gte: parseIsoDate(startsOn),
          lte: parseIsoDate(endsOn),
        },
      },
      _sum: { quantity: true },
    });
    const used = new Map<string, number>();
    for (const row of existing) {
      const iso = toIsoDateOnly(row.reservedAt);
      if (iso) used.set(iso, row._sum.quantity ?? 0);
    }
    const overflow = [...perDay.keys()].filter(
      (iso) => (used.get(iso) ?? 0) + (perDay.get(iso) ?? 0) > maxMeals,
    );
    if (overflow.length) {
      throw new BadRequestException(
        `سقف تعداد غذای این واحد در این روزها تکمیل می‌شود: ${joinDates(overflow)}`,
      );
    }
  }
}
