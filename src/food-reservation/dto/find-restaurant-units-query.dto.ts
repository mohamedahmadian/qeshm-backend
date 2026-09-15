import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { emptyToUndefined } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

export const restaurantUnitSortFields = ['unit', 'kind', 'phone'] as const;

export class FindRestaurantUnitsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...restaurantUnitSortFields])
  sortBy?: (typeof restaurantUnitSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];
}
