import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { emptyToUndefined, toOptionalBoolean } from '../../common/dto-transform';
import { foodMealTypes } from '../food-meal-type';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class FoodReservationBatchItemDto {
  @IsUUID('4')
  foodId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  quantity: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  forGuest?: boolean;
}

export class CreateFoodReservationBatchDto {
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

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => FoodReservationBatchItemDto)
  items: FoodReservationBatchItemDto[];
}
