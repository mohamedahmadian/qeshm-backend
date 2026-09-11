import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull, toOptionalNumber } from '../../common/dto-transform';
import {
  IsIranianLegalNationalId,
  normalizeLegalNationalId,
} from '../../common/national-id';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
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
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

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
}

export class CreateGlobalContractorDto extends CreateContractorDto {
  @IsUUID()
  projectId: string;
}
