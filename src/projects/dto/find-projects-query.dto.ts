import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { emptyToUndefined, toOptionalBoolean } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { ProjectImportance } from '../../generated/prisma/client';

export const projectSortFields = [
  'vicePresidency',
  'management',
  'unit',
  'systemName',
  'isActive',
  'companyName',
  'systemUrl',
  'launchYear',
  'isSupportActive',
  'replacement',
  'importance',
] as const;

export type ProjectSortField = (typeof projectSortFields)[number];

export class FindProjectsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  vicePresidency?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  management?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  unit?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  companyName?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isSupportActive?: boolean;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(ProjectImportance)
  importance?: ProjectImportance;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  excludeId?: string;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...projectSortFields])
  sortBy?: ProjectSortField;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
