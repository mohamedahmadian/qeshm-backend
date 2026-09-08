import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
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
import { emptyToNull, toOptionalNumber } from '../../common/dto-transform';
import { ProjectImportance } from '../../generated/prisma/client';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateProjectDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  vicePresidency: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  management: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  unit: string;

  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  systemName: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(200)
  companyName?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(500)
  systemUrl?: string | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(1300)
  @Max(1600)
  launchYear?: number | null;

  @IsOptional()
  @IsBoolean()
  isSupportActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID()
  replacementProjectId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsEnum(ProjectImportance)
  importance?: ProjectImportance;
}
