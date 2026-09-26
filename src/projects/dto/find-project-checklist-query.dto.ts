import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { toOptionalBoolean } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const projectChecklistSortFields = [
  'title',
  'weightPercent',
  'isDone',
] as const;

export type ProjectChecklistSortField =
  (typeof projectChecklistSortFields)[number];

export class FindProjectChecklistQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isDone?: boolean;

  @IsOptional()
  @IsIn([...projectChecklistSortFields])
  sortBy?: ProjectChecklistSortField;

  @IsOptional()
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
