import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { foodMealTypes } from '../food-meal-type';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const advancedFoodOrderSources = ['DEFAULT', 'MENU'] as const;
export const advancedFoodOrderWeekdays = [0, 1, 2, 3, 4] as const;

function toWeekdays(value: unknown) {
  if (!Array.isArray(value)) return value;
  const days = value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item));
  return [...new Set(days)].sort((a, b) => a - b);
}

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAdvancedFoodOrderDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(isoDate, { message: 'تاریخ شروع معتبر نیست' })
  startsOn: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(isoDate, { message: 'تاریخ پایان معتبر نیست' })
  endsOn: string;

  @Transform(({ value }) => toWeekdays(value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsIn([...advancedFoodOrderWeekdays], { each: true })
  weekdays: number[];

  @IsUUID('4')
  orgUnitId: string;

  @IsUUID('4')
  restaurantId: string;

  @IsIn([...advancedFoodOrderSources])
  source: (typeof advancedFoodOrderSources)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...foodMealTypes])
  mealType?: (typeof foodMealTypes)[number];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  employeeQuantity: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  managementQuantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  employeeGuestQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  managementGuestQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999999999)
  employeeUnitPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999999999999)
  managementUnitPrice?: number;
}
