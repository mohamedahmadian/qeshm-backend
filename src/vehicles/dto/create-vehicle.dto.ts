import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';

export const vehicleTypes = [
  'SEDAN',
  'PICKUP',
  'TRUCK',
  'MINIBUS',
  'MOTORCYCLE',
  'OTHER',
] as const;

export const vehicleStatuses = [
  'ACTIVE',
  'IN_REPAIR',
  'SCRAPPED',
  'TRANSFERRED',
  'MISSING',
] as const;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeCode(value: unknown) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.trim().replace(/\s+/g, ' ');
}

export class CreateVehicleDto {
  @Transform(({ value }) => normalizeCode(value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  assetCode: string;

  @Transform(({ value }) => normalizeCode(value))
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  plate: string;

  @IsIn([...vehicleTypes])
  type: (typeof vehicleTypes)[number];

  @IsUUID('4')
  brandId: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  model: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(40)
  color?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(2100)
  year?: number | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(80)
  chassisNumber?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(80)
  engineNumber?: string | null;

  @IsOptional()
  @IsIn([...vehicleStatuses])
  status?: (typeof vehicleStatuses)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
