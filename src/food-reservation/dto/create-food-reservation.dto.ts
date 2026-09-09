import { Transform, Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { toOptionalNumber } from '../../common/dto-transform';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateFoodReservationDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(isoDate, { message: 'تاریخ رزرو معتبر نیست' })
  reservedAt: string;

  @IsUUID('4')
  restaurantId: string;

  @IsUUID('4')
  foodId: string;

  @Transform(({ value }) => toOptionalNumber(value) ?? 1)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  quantity?: number;
}
