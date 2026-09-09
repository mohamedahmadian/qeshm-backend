import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from 'class-validator';
import { toOptionalBoolean, toOptionalNumber } from '../../common/dto-transform';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateRestaurantMenuItemDto {
  @IsUUID('4')
  foodId: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(isoDate, { message: 'تاریخ معتبر نیست' })
  offeredAt: string;

  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}
