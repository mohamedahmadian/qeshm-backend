import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { emptyToNull, toOptionalNumber } from '../../common/dto-transform';
import {
  ProjectProgressProcessingMode,
  ProjectProgressTranscriptionStatus,
} from '../../generated/prisma/client';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateProjectProgressDto {
  @Transform(({ value }) => trimString(value))
  @IsString()
  @Matches(isoDate, { message: 'تاریخ ثبت معتبر نیست' })
  occurredAt: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(20000)
  body?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(20000)
  transcript?: string | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number | null;

  @IsOptional()
  @IsEnum(ProjectProgressProcessingMode)
  processingMode?: ProjectProgressProcessingMode;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID()
  audioId?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  imageIds?: string[];
}

export { ProjectProgressProcessingMode, ProjectProgressTranscriptionStatus };
