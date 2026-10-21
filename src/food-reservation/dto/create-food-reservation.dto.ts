import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { emptyToUndefined, toOptionalBoolean, toOptionalNumber } from '../../common/dto-transform';
import { foodMealTypes } from '../food-meal-type';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateFoodReservationDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(isoDate, { message: 'تاریخ رزرو معتبر نیست' })
  reservedAt: string;

  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string;

  @IsUUID('4')
  restaurantId: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...foodMealTypes])
  mealType?: (typeof foodMealTypes)[number];

  @IsUUID('4')
  foodId: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value) ?? 1)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  quantity?: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  forGuest?: boolean;
}
