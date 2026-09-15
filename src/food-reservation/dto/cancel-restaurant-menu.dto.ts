import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CancelRestaurantMenuDto {
  @IsUUID('4')
  foodId: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(isoDate, { message: 'تاریخ معتبر نیست' })
  offeredAt: string;

  @IsOptional()
  @Transform(({ value }) =>
    emptyToUndefined(typeof value === 'string' ? value.trim() : value),
  )
  @IsString()
  @Matches(isoDate, { message: 'تاریخ معتبر نیست' })
  offeredUntil?: string;
}
