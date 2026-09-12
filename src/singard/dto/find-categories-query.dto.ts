import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { emptyToUndefined, toOptionalBoolean } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const singardCategorySortFields = [
  'name',
  'sortOrder',
  'isActive',
  'parent',
  'childCount',
  'feedbackCount',
  'createdAt',
] as const;

export class FindSingardCategoriesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...singardCategorySortFields])
  sortBy?: (typeof singardCategorySortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf((_, value) => value != null)
  @IsUUID('4')
  parentId?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}
