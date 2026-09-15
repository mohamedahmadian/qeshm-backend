import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const projectDocumentSortFields = [
  'title',
  'originalName',
  'byteSize',
  'createdAt',
] as const;

export type ProjectDocumentSortField = (typeof projectDocumentSortFields)[number];

export class FindProjectDocumentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...projectDocumentSortFields])
  sortBy?: ProjectDocumentSortField;

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
