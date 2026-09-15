import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { emptyToNull, toOptionalBoolean } from '../../common/dto-transform';
import { boardRequestStatuses, boardReviewStages } from '../board.constants';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function uniqueIds(value: unknown) {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim()
      ? [value.trim()]
      : [];
  return [...new Set(list.filter((item) => typeof item === 'string' && item.trim()))];
}

export class ReviewBoardRequestDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @Transform(({ value }) => trimString(value))
  @Matches(isoDate)
  occurredAt: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(trimString(value)))
  @ValidateIf((_, value) => value != null)
  @IsString()
  @MaxLength(8000)
  comment?: string | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @ValidateIf((_, value) => value != null)
  @IsBoolean()
  legalOrgMatch?: boolean | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @ValidateIf((_, value) => value != null)
  @IsBoolean()
  legalRegulationsMatch?: boolean | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @ValidateIf((_, value) => value != null)
  @IsBoolean()
  budgetProgramHistory?: boolean | null;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @ValidateIf((_, value) => value != null)
  @IsBoolean()
  budgetCurrentYearFunding?: boolean | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  imageIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  fileIds?: string[];
}

export class UpdateBoardRequestStatusDto {
  @IsIn([...boardRequestStatuses])
  status: (typeof boardRequestStatuses)[number];
}

export class BoardStagePermissionDto {
  @IsIn([...boardReviewStages])
  stage: (typeof boardReviewStages)[number];

  @Transform(({ value }) => uniqueIds(value))
  @IsArray()
  @IsUUID('4', { each: true })
  unitIds: string[];

  @Transform(({ value }) => uniqueIds(value))
  @IsArray()
  @IsUUID('4', { each: true })
  positionIds: string[];
}

export class UpdateBoardPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BoardStagePermissionDto)
  stages: BoardStagePermissionDto[];
}
