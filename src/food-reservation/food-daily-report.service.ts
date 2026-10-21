import { Injectable } from '@nestjs/common';
import { buildStyledExcelExport } from '../common/excel-export';
import {
  addDaysIso,
  parseIsoDate,
  todayIsoDateTehran,
  toIsoDateOnly,
} from '../common/iso-date';
import { FoodReservationStatus, Prisma } from '../generated/prisma/client';
import { buildOrganizationUnitPaths } from '../organization/organization-unit-tree';
import { PrismaService } from '../prisma/prisma.service';
import {
  DailyFoodReportSortField,
  FindDailyFoodReportQueryDto,
} from './dto/find-daily-food-report-query.dto';
import { foodMealTypeLabel } from './food-meal-type';
import { formatExportDate } from './food-reservations.service';
import { MANAGEMENT_MEAL_PREFIX } from './restaurants.service';

/** تعداد روزهای نمودار روند (شامل روز انتخاب‌شده). */
const TREND_DAYS = 7;

type Totals = {
  orderCount: number;
  servings: number;
  employeeQuantity: number;
  employeeGuestQuantity: number;
  employeeAmount: number;
  managementQuantity: number;
  managementGuestQuantity: number;
  managementAmount: number;
  guestQuantity: number;
  guestAmount: number;
  totalAmount: number;
  confirmedCount: number;
  pendingCount: number;
  confirmedAmount: number;
  pendingAmount: number;
};

type DailyRow = Totals & {
  unitId: string;
  unitName: string;
  restaurantId: string | null;
  restaurantName: string | null;
  mealType: 'LUNCH' | 'DINNER' | null;
};

const reportSelect = {
  reservedAt: true,
  mealType: true,
  quantity: true,
  unitPrice: true,
  status: true,
  forGuest: true,
  orgUnitId: true,
  restaurantId: true,
  food: { select: { name: true } },
  orgUnit: { select: { name: true } },
  restaurant: { select: { name: true } },
  advancedOrder: {
    select: {
      source: true,
      employeeQuantity: true,
      managementQuantity: true,
      employeeGuestQuantity: true,
      managementGuestQuantity: true,
    },
  },
} satisfies Prisma.FoodReservationSelect;

type ReportRow = Prisma.FoodReservationGetPayload<{ select: typeof reportSelect }>;

function emptyTotals(): Totals {
  return {
    orderCount: 0,
    servings: 0,
    employeeQuantity: 0,
    employeeGuestQuantity: 0,
    employeeAmount: 0,
    managementQuantity: 0,
    managementGuestQuantity: 0,
    managementAmount: 0,
    guestQuantity: 0,
    guestAmount: 0,
    totalAmount: 0,
    confirmedCount: 0,
    pendingCount: 0,
    confirmedAmount: 0,
    pendingAmount: 0,
  };
}

/**
 * غذای مدیریتی با پیشوند نام غذا (غذای پیش‌فرض رستوران) شناخته می‌شود.
 * در رزرو پیشرفتهٔ «منو» یک سطر هر دو گروه را دارد و با تعداد ثبت‌شده در سفارش تقسیم می‌شود.
 */
function splitQuantity(row: ReportRow) {
  let management = 0;
  if (row.food.name.startsWith(MANAGEMENT_MEAL_PREFIX)) {
    management = row.quantity;
  } else if (row.advancedOrder?.source === 'MENU') {
    const order = row.advancedOrder;
    const employeeQuantity = order.employeeQuantity + order.employeeGuestQuantity;
    const managementQuantity = order.managementQuantity + order.managementGuestQuantity;
    const sum = employeeQuantity + managementQuantity;
    if (sum > 0) {
      management = Math.min(
        row.quantity,
        Math.round((row.quantity * managementQuantity) / sum),
      );
    }
  }
  return { employee: row.quantity - management, management };
}

/** تعداد مهمان هر گروه؛ در منوی روزانه نسبت مهمان کارمندی/مدیریتی سفارش اعمال می‌شود. */
function splitGuestQuantity(row: ReportRow) {
  if (!row.forGuest) {
    return { employeeGuest: 0, managementGuest: 0 };
  }
  if (row.food.name.startsWith(MANAGEMENT_MEAL_PREFIX)) {
    return { employeeGuest: 0, managementGuest: row.quantity };
  }
  if (row.advancedOrder?.source === 'MENU') {
    const order = row.advancedOrder;
    const employeeGuest = order.employeeGuestQuantity;
    const managementGuest = order.managementGuestQuantity;
    const sum = employeeGuest + managementGuest;
    if (sum > 0) {
      const management = Math.min(
        row.quantity,
        Math.round((row.quantity * managementGuest) / sum),
      );
      return { employeeGuest: row.quantity - management, managementGuest: management };
    }
  }
  return { employeeGuest: row.quantity, managementGuest: 0 };
}

function addRow(target: Totals, row: ReportRow) {
  const unitPrice = Number(row.unitPrice);
  const { employee, management } = splitQuantity(row);
  const { employeeGuest, managementGuest } = splitGuestQuantity(row);
  const amount = unitPrice * row.quantity;
  target.orderCount += 1;
  target.servings += row.quantity;
  target.employeeQuantity += employee;
  target.employeeGuestQuantity += employeeGuest;
  target.employeeAmount += unitPrice * employee;
  target.managementQuantity += management;
  target.managementGuestQuantity += managementGuest;
  target.managementAmount += unitPrice * management;
  const guest = employeeGuest + managementGuest;
  target.guestQuantity += guest;
  target.guestAmount += unitPrice * guest;
  target.totalAmount += amount;
  if (row.status === FoodReservationStatus.CONFIRMED) {
    target.confirmedCount += 1;
    target.confirmedAmount += amount;
  } else {
    target.pendingCount += 1;
    target.pendingAmount += amount;
  }
}

function byText(a: string | null, b: string | null) {
  return (a ?? '').localeCompare(b ?? '', 'fa');
}

const comparators: Record<DailyFoodReportSortField, (a: DailyRow, b: DailyRow) => number> = {
  unit: (a, b) => byText(a.unitName, b.unitName),
  restaurant: (a, b) => byText(a.restaurantName, b.restaurantName),
  mealType: (a, b) => byText(a.mealType, b.mealType),
  orderCount: (a, b) => a.orderCount - b.orderCount,
  servings: (a, b) => a.servings - b.servings,
  employeeQuantity: (a, b) => a.employeeQuantity - b.employeeQuantity,
  employeeAmount: (a, b) => a.employeeAmount - b.employeeAmount,
  managementQuantity: (a, b) => a.managementQuantity - b.managementQuantity,
  managementAmount: (a, b) => a.managementAmount - b.managementAmount,
  guestQuantity: (a, b) => a.guestQuantity - b.guestQuantity,
  guestAmount: (a, b) => a.guestAmount - b.guestAmount,
  totalAmount: (a, b) => a.totalAmount - b.totalAmount,
};

@Injectable()
export class FoodDailyReportService {
  constructor(private readonly prisma: PrismaService) {}

  async report(query: FindDailyFoodReportQueryDto) {
    const date = query.date ?? todayIsoDateTehran();
    const previousDate = addDaysIso(date, -1);
    const windowStart = addDaysIso(date, -(TREND_DAYS - 1));

    const [records, units] = await Promise.all([
      this.prisma.foodReservation.findMany({
        where: {
          reservedAt: { gte: parseIsoDate(windowStart), lte: parseIsoDate(date) },
          orgUnitId: query.orgUnitId,
          restaurantId: query.restaurantId,
          mealType: query.mealType,
          status: query.status,
        },
        select: reportSelect,
      }),
      this.prisma.organizationUnit.findMany({
        select: {
          id: true,
          name: true,
          parentId: true,
          restaurants: { select: { restaurantId: true } },
        },
      }),
    ]);
    const paths = buildOrganizationUnitPaths(units);
    const unitLabel = (id: string, fallback: string) => paths.get(id) ?? fallback;

    const summary = emptyTotals();
    const previous = emptyTotals();
    const groups = new Map<string, DailyRow>();
    const restaurants = new Map<
      string,
      { id: string; name: string } & Totals
    >();
    const meals = new Map<string, { mealType: 'LUNCH' | 'DINNER' } & Totals>();
    const trendMap = new Map<string, Totals>();
    for (let offset = TREND_DAYS - 1; offset >= 0; offset -= 1) {
      trendMap.set(addDaysIso(date, -offset), emptyTotals());
    }
    const orderedUnits = new Set<string>();

    for (const row of records) {
      const day = toIsoDateOnly(row.reservedAt) ?? '';
      const trend = trendMap.get(day);
      if (trend) addRow(trend, row);
      if (day === previousDate) addRow(previous, row);
      if (day !== date) continue;

      addRow(summary, row);
      orderedUnits.add(row.orgUnitId);

      const key = `${row.orgUnitId}|${row.restaurantId}|${row.mealType}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          ...emptyTotals(),
          unitId: row.orgUnitId,
          unitName: unitLabel(row.orgUnitId, row.orgUnit.name),
          restaurantId: row.restaurantId,
          restaurantName: row.restaurant.name,
          mealType: row.mealType,
        };
        groups.set(key, group);
      }
      addRow(group, row);

      let restaurant = restaurants.get(row.restaurantId);
      if (!restaurant) {
        restaurant = {
          ...emptyTotals(),
          id: row.restaurantId,
          name: row.restaurant.name,
        };
        restaurants.set(row.restaurantId, restaurant);
      }
      addRow(restaurant, row);

      let meal = meals.get(row.mealType);
      if (!meal) {
        meal = { ...emptyTotals(), mealType: row.mealType };
        meals.set(row.mealType, meal);
      }
      addRow(meal, row);
    }

    const eligibleUnits = units.filter(
      (unit) =>
        (!query.orgUnitId || unit.id === query.orgUnitId) &&
        unit.restaurants.length > 0 &&
        (!query.restaurantId ||
          unit.restaurants.some((link) => link.restaurantId === query.restaurantId)),
    );
    const idleUnits = eligibleUnits.filter((unit) => !orderedUnits.has(unit.id));

    const rows: DailyRow[] = [...groups.values()];
    if (query.showEmpty) {
      for (const unit of idleUnits) {
        rows.push({
          ...emptyTotals(),
          unitId: unit.id,
          unitName: unitLabel(unit.id, unit.name),
          restaurantId: null,
          restaurantName: null,
          mealType: null,
        });
      }
    }
    const compare = comparators[query.sortBy ?? 'unit'] ?? comparators.unit;
    const direction = query.sortDir === 'desc' ? -1 : 1;
    rows.sort(
      (a, b) =>
        direction * compare(a, b) ||
        comparators.unit(a, b) ||
        comparators.restaurant(a, b) ||
        comparators.mealType(a, b),
    );

    return {
      date,
      previousDate,
      summary: {
        ...summary,
        unitCount: orderedUnits.size,
        restaurantCount: restaurants.size,
        idleUnitCount: idleUnits.length,
        avgPerServing: summary.servings > 0 ? summary.totalAmount / summary.servings : 0,
      },
      previous: {
        orderCount: previous.orderCount,
        servings: previous.servings,
        totalAmount: previous.totalAmount,
      },
      rows,
      byRestaurant: [...restaurants.values()].sort(
        (a, b) => b.totalAmount - a.totalAmount || byText(a.name, b.name),
      ),
      byMealType: [...meals.values()].sort((a, b) => byText(a.mealType, b.mealType)),
      trend: [...trendMap.entries()].map(([day, totals]) => ({ date: day, ...totals })),
    };
  }

  async exportReport(query: FindDailyFoodReportQueryDto) {
    const report = await this.report(query);
    const totals = report.summary;
    return buildStyledExcelExport({
      sheetName: `گزارش روزانه ${formatExportDate(report.date)}`.replace(/[\\/?*[\]:]/g, '-'),
      fileName: `گزارش-روزانه-غذا-${report.date}.xlsx`,
      columns: [
        { header: 'واحد', key: 'unit', width: 34 },
        { header: 'رستوران', key: 'restaurant', width: 24 },
        { header: 'وعده', key: 'mealType', width: 12 },
        { header: 'تعداد سفارش', key: 'orderCount', width: 14 },
        { header: 'تعداد پرس', key: 'servings', width: 14 },
        { header: 'تعداد غذای کارمندی', key: 'employeeQuantity', width: 20 },
        { header: 'مبلغ غذای کارمندی', key: 'employeeAmount', width: 20 },
        { header: 'تعداد غذای مدیریتی', key: 'managementQuantity', width: 20 },
        { header: 'مبلغ غذای مدیریتی', key: 'managementAmount', width: 20 },
        { header: 'تعداد غذای مهمان', key: 'guestQuantity', width: 18 },
        { header: 'مبلغ غذای مهمان', key: 'guestAmount', width: 18 },
        { header: 'مبلغ کل', key: 'totalAmount', width: 20 },
      ],
      rows: report.rows.map((row) => ({
        unit: row.unitName,
        restaurant: row.restaurantName ?? '—',
        mealType: row.mealType ? foodMealTypeLabel(row.mealType) : '—',
        orderCount: row.orderCount,
        servings: row.servings,
        employeeQuantity: row.employeeQuantity,
        employeeAmount: row.employeeAmount,
        managementQuantity: row.managementQuantity,
        managementAmount: row.managementAmount,
        guestQuantity: row.guestQuantity,
        guestAmount: row.guestAmount,
        totalAmount: row.totalAmount,
      })),
      totals: {
        orderCount: totals.orderCount,
        servings: totals.servings,
        employeeQuantity: totals.employeeQuantity,
        employeeAmount: totals.employeeAmount,
        managementQuantity: totals.managementQuantity,
        managementAmount: totals.managementAmount,
        guestQuantity: totals.guestQuantity,
        guestAmount: totals.guestAmount,
        totalAmount: totals.totalAmount,
      },
    });
  }
}
