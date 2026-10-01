import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { emptyToUndefined, toOptionalBoolean } from '../../common/dto-transform';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class FoodReservationRangeActionDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(isoDate, { message: 'تاریخ معتبر نیست' })
  reservedFrom!: string;

  @IsOptional()
  @Transform(({ value }) =>
    emptyToUndefined(typeof value === 'string' ? value.trim() : value),
  )
  @IsString()
  @Matches(isoDate, { message: 'تاریخ معتبر نیست' })
  reservedTo?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  orgUnitId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  restaurantId?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  includeConfirmed?: boolean;
}
