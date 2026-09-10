import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { ProjectStatus } from '../../generated/prisma/client';

export const projectPhaseSortFields = [
  'name',
  'startDate',
  'endDate',
  'status',
  'progressPercent',
] as const;

export type ProjectPhaseSortField = (typeof projectPhaseSortFields)[number];

export class FindProjectPhasesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...projectPhaseSortFields])
  sortBy?: ProjectPhaseSortField;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
