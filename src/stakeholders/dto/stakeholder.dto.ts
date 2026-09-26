import { PartialType } from '@nestjs/mapped-types';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { emptyToNull, emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import {
  correspondenceSortFields,
  progressSortFields,
  projectSortFields,
  stakeholderActionResults,
  stakeholderCorrespondenceKinds,
  stakeholderCorrespondenceStatuses,
} from '../stakeholders.constants';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

function optionalText(value: unknown) {
  if (value == null) return value;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export class FindPortalProjectsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...projectSortFields])
  sortBy?: (typeof projectSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}

export class FindProgressReportsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...progressSortFields])
  sortBy?: (typeof progressSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  contractorId?: string;
}

export class CreateProgressReportDto {
  @IsUUID('4')
  projectId!: string;

  @Matches(isoDate, { message: 'تاریخ گزارش معتبر نیست' })
  occurredAt!: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' || value == null ? null : Number(value)))
  @ValidateIf((_, value) => value != null)
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number | null;

  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  actionsDone?: string | null;

  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  nextPlan?: string | null;

  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  blockers?: string | null;

  @IsOptional()
  @Transform(({ value }) => optionalText(value))
  @ValidateIf((_, value) => value != null)
  @IsString()
  needs?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  imageIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  fileIds?: string[];
}

export class UpdateProgressReportDto extends PartialType(CreateProgressReportDto) {}

export class FindCorrespondencesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...correspondenceSortFields])
  sortBy?: (typeof correspondenceSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...stakeholderCorrespondenceKinds])
  kind?: (typeof stakeholderCorrespondenceKinds)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...stakeholderCorrespondenceStatuses])
  status?: (typeof stakeholderCorrespondenceStatuses)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  projectId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  contractorId?: string;
}

export class CreateCorrespondenceDto {
  @IsIn([...stakeholderCorrespondenceKinds])
  kind!: (typeof stakeholderCorrespondenceKinds)[number];

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  body!: string;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  projectId?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @Matches(isoDate, { message: 'موعد معتبر نیست' })
  dueDate?: string | null;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  imageIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  fileIds?: string[];
}

export class UpdateCorrespondenceDto extends PartialType(CreateCorrespondenceDto) {}

export class CreateStakeholderMessageDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  body!: string;
}

export class UpdateCorrespondenceWorkflowDto {
  @IsOptional()
  @IsIn([...stakeholderCorrespondenceStatuses])
  status?: (typeof stakeholderCorrespondenceStatuses)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToNull(value))
  @ValidateIf((_, value) => value != null)
  @IsIn([...stakeholderActionResults])
  actionResult?: (typeof stakeholderActionResults)[number] | null;
}
