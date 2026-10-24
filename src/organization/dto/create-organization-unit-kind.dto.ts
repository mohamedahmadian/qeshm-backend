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

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeKindCode(value: unknown) {
  if (typeof value !== 'string') return emptyToNull(value);
  const code = value.trim().toUpperCase();
  return code || null;
}

export class CreateOrganizationUnitKindDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsOptional()
  @Transform(({ value }) => normalizeKindCode(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{0,39}$/, { message: 'کد نوع واحد معتبر نیست' })
  code?: string | null;
}
