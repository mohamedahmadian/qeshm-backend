import { Transform } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull, toOptionalNumber } from '../../common/dto-transform';
import { normalizePhone } from '../../common/phone';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeOrgPhone(value: unknown) {
  if (typeof value !== 'string') {
    return emptyToNull(value);
  }
  const digits = normalizePhone(value).replace(/\D/g, '');
  return digits || null;
}

export class CreateOrganizationUnitDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsUUID('4')
  kindId: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  parentId?: string | null;

  @IsOptional()
  @Transform(({ value }) => normalizeOrgPhone(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @Matches(/^\d{8,15}$/, { message: 'شماره تلفن معتبر نیست' })
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  address?: string | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsLatitude()
  latitude?: number | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsLongitude()
  longitude?: number | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(300)
  eitaa?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(300)
  bale?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(300)
  rubika?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(300)
  instagram?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(300)
  telegram?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(300)
  whatsapp?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  nutritionRepId?: string | null;
}
