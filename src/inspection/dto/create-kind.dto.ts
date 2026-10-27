import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull, toBoolean, toOptionalNumber } from '../../common/dto-transform';
import { inspectionKindIcons } from '../inspection.constants';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateInspectionKindDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @Transform(({ value }) => trimString(value))
  @IsIn([...inspectionKindIcons])
  icon: (typeof inspectionKindIcons)[number];

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(0)
  @Max(9999)
  sortOrder?: number;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value, true))
  @IsBoolean()
  isActive?: boolean;
}
