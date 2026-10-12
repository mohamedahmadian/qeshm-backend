import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';
import { toLatinDigits } from '../../common/national-id';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizePhone(value: unknown) {
  if (typeof value !== 'string') {
    return emptyToNull(value);
  }
  const digits = toLatinDigits(value.trim()).replace(/[^\d+]/g, '');
  return digits.length ? digits : null;
}

function toMealPrice(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const digits = toLatinDigits(value.trim()).replace(/\D/g, '');
    return digits.length ? Number(digits) : value;
  }
  return value;
}

export class CreateRestaurantDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsOptional()
  @Transform(({ value }) => normalizePhone(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  logoId?: string | null;

  @Transform(({ value }) => toMealPrice(value))
  @IsInt()
  @Min(0)
  employeeMealPrice: number;

  @Transform(({ value }) => toMealPrice(value))
  @IsInt()
  @Min(0)
  managementMealPrice: number;
}
