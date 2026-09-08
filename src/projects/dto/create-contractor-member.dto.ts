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
import { normalizeMobile } from '../../common/phone';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateContractorMemberDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeMobile(value) || null : emptyToNull(value),
  )
  @ValidateIf((_, value) => value != null)
  @IsString()
  @Matches(/^09\d{9}$/, { message: 'شماره همراه معتبر نیست' })
  phone?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(120)
  role?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
