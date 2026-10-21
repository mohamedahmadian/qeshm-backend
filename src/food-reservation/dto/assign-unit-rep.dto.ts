import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { toBoolean, toOptionalNumber } from '../../common/dto-transform';
import { IsIranianNationalId, normalizeNationalId } from '../../common/national-id';
import { normalizeMobile } from '../../common/phone';

export class CreateUnitRepDto {
  @IsUUID('4')
  unitId: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  nutritionRepId?: string | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(1)
  @Max(9999)
  maxMeals?: number | null;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  guestMealsEnabled: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(1)
  @Max(9999)
  maxGuestMeals?: number | null;
}

export class UpdateUnitRepDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @ValidateIf((_, value) => value != null && value !== '')
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  nutritionRepId?: string | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(1)
  @Max(9999)
  maxMeals?: number | null;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  guestMealsEnabled: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(1)
  @Max(9999)
  maxGuestMeals?: number | null;
}

export class CreateUnitRepUnitDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  code: string;

  @IsUUID('4')
  kindId: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  parentId?: string | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(1)
  @Max(9999)
  maxMeals?: number | null;

  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  guestMealsEnabled: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(1)
  @Max(9999)
  maxGuestMeals?: number | null;
}

export class CreateUnitRepPersonDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  firstName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  lastName: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeNationalId(value) : value))
  @IsIranianNationalId()
  nationalId: string;

  @Transform(({ value }) => (typeof value === 'string' ? normalizeMobile(value) : value))
  @Matches(/^09\d{9}$/, { message: 'تلفن همراه معتبر نیست' })
  phone: string;
}
