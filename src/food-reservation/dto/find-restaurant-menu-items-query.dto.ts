import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { emptyToUndefined, toOptionalBoolean } from '../../common/dto-transform';
import { PaginationQueryDto } from '../../common/pagination';
import { sortDirections } from '../../common/sort-query';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const restaurantMenuItemSortFields = [
  'offeredAt',
  'food',
  'price',
  'isActive',
] as const;

export class FindRestaurantMenuItemsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...restaurantMenuItemSortFields])
  sortBy?: (typeof restaurantMenuItemSortFields)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsIn([...sortDirections])
  sortDir?: (typeof sortDirections)[number];

  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @Matches(isoDate)
  offeredAt?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  isActive?: boolean;
}
