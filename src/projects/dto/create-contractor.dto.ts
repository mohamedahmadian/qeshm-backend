import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull, toOptionalNumber } from '../../common/dto-transform';
import {
  IsIranianLegalNationalId,
  normalizeLegalNationalId,
  toLatinDigits,
} from '../../common/national-id';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizePhone(value: unknown) {
  if (typeof value !== 'string') {
    return emptyToNull(value);
  }
  const digits = toLatinDigits(value.trim()).replace(/\D/g, '');
  return digits.length ? digits : null;
}

function normalizeRegistrationNumber(value: unknown) {
  if (typeof value !== 'string') {
    return emptyToNull(value);
  }
  const digits = toLatinDigits(value.trim()).replace(/\D/g, '');
  return digits.length ? digits : null;
}

export class CreateContractorDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? normalizeLegalNationalId(value) || null
      : emptyToNull(value),
  )
  @ValidateIf((_, value) => value != null)
  @IsIranianLegalNationalId()
  nationalId?: string | null;

  @IsOptional()
  @Transform(({ value }) => normalizeRegistrationNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(30)
  registrationNumber?: string | null;

  @IsOptional()
  @Transform(({ value }) => normalizePhone(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(20)
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    const trimmed = emptyToNull(trimString(value));
    return typeof trimmed === 'string' ? trimmed.toLowerCase() : trimmed;
  })
  @ValidateIf((_, value) => value != null)
  @IsEmail({}, { message: 'ایمیل معتبر نیست' })
  @MaxLength(200)
  email?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(300)
  @IsUrl(
    { require_protocol: false, require_tld: true },
    { message: 'نشانی وب‌سایت معتبر نیست' },
  )
  website?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @Matches(isoDate, { message: 'تاریخ شروع قرارداد معتبر نیست' })
  contractStartDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @Matches(isoDate, { message: 'تاریخ پایان قرارداد معتبر نیست' })
  contractEndDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @Matches(isoDate, { message: 'تاریخ شروع قرارداد پشتیبانی معتبر نیست' })
  supportStartDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @Matches(isoDate, { message: 'تاریخ پایان قرارداد پشتیبانی معتبر نیست' })
  supportEndDate?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(200)
  ceoName?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(200)
  timeEstimate?: string | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsNumber()
  @Min(0)
  costEstimate?: number | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID()
  typeId?: string | null;
}

export class CreateGlobalContractorDto extends CreateContractorDto {
  @IsUUID()
  projectId: string;
}
