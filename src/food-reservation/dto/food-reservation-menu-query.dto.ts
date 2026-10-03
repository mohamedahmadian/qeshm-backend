import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class FoodReservationLastQuantityQueryDto {
  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string;

  @IsOptional()
  @IsUUID('4')
  restaurantId?: string;

  @IsOptional()
  @IsUUID('4')
  foodId?: string;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class FoodReservationMenuQueryDto {
  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string;

  @IsUUID('4')
  restaurantId: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(isoDate, { message: 'تاریخ معتبر نیست' })
  offeredAt: string;
}

export class FoodReservationWeekMenuQueryDto {
  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string;

  @IsUUID('4')
  restaurantId: string;
}
