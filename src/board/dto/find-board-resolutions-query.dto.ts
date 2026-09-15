import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';
import { boardMinutesResolutionSortFields } from '../board.constants';

export class FindBoardResolutionsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...boardMinutesResolutionSortFields])
  sortBy?: (typeof boardMinutesResolutionSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
