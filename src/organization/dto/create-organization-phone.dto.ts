import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull } from '../../common/dto-transform';
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

export class CreateOrganizationPhoneDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  title: string;

  @Transform(({ value }) => normalizeOrgPhone(value))
  @IsString()
  @Matches(/^\d{8,15}$/, { message: 'شماره تلفن معتبر نیست' })
  phone: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
