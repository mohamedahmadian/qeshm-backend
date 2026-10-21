import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { emptyToUndefined, toOptionalBoolean } from '../../common/dto-transform';
import { sortDirections } from '../../common/sort-query';
import { foodMealTypes } from '../food-meal-type';
import { foodReservationStatuses } from './find-food-reservations-query.dto';

export const dailyFoodReportSortFields = [
  'unit',
  'restaurant',
  'mealType',
  'orderCount',
  'servings',
  'employeeQuantity',
  'employeeAmount',
  'managementQuantity',
  'managementAmount',
  'guestQuantity',
  'guestAmount',
  'totalAmount',
] as const;

export type DailyFoodReportSortField = (typeof dailyFoodReportSortFields)[number];

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export class FindDailyFoodReportQueryDto {
  /** ISO میلادی؛ پیش‌فرض امروز به وقت تهران. */
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @Matches(isoDate)
  date?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  orgUnitId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  restaurantId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...foodMealTypes])
  mealType?: (typeof foodMealTypes)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...foodReservationStatuses])
  status?: (typeof foodReservationStatuses)[number];

  /** واحدهای دارای رستوران که آن روز سفارشی نداشته‌اند هم در جدول بیایند. */
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  showEmpty?: boolean;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...dailyFoodReportSortFields])
  sortBy?: DailyFoodReportSortField;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
